import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { providerStatus, twelveData } from "@/lib/providers";

export const dynamic = "force-dynamic";

const TABLES = ["companies", "financials", "scores", "price_cache", "ingest_runs"];

/**
 * Reports what the *running application* can actually see.
 *
 * Diagnosing an empty screener from the outside is guesswork, because the app
 * and any admin shell may be on different networks with different environments.
 * Hitting this on the deployment that renders the page answers it directly.
 *
 * Deliberately exposes no credentials: the connection string is reduced to a
 * host and database name.
 */
export async function GET() {
  const started = Date.now();

  const url = process.env.DATABASE_URL;
  const database: Record<string, unknown> = {
    configured: isDatabaseConfigured(),
    host: url ? describeUrl(url) : null,
    // The single most common misconfiguration: an internal-only hostname used
    // from a deployment that sits outside that private network.
    internalHostname: url ? /\.railway\.internal|\.internal\b/.test(url) : false,
  };

  if (isDatabaseConfigured()) {
    try {
      const db = getDb();

      const present = await db.execute<{ table_name: string }>(sql`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      `);
      const names = new Set(present.map((r) => r.table_name));
      database.tables = Object.fromEntries(TABLES.map((t) => [t, names.has(t)]));
      database.missingTables = TABLES.filter((t) => !names.has(t));

      if (names.has("companies")) {
        const counts = await db.execute<{ companies: number; scores: number }>(sql`
          SELECT
            (SELECT count(*)::int FROM companies) AS companies,
            (SELECT count(*)::int FROM scores) AS scores
        `);
        database.companies = counts[0]?.companies ?? 0;
        database.scores = counts[0]?.scores ?? 0;
      }

      database.reachable = true;
    } catch (err) {
      database.reachable = false;
      database.error = redact(err);
    }
  }

  const status = summarize(database);

  return NextResponse.json(
    {
      status: status.state,
      message: status.message,
      database,
      providers: providerStatus(),
      priceData: await probePriceProvider(),
      checkedInMs: Date.now() - started,
    },
    {
      status: status.state === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * Makes one real call to the price provider and reports what came back.
 *
 * A key can be present and still not work — invalid, out of quota, or on a plan
 * that excludes the endpoint. Only an actual request distinguishes those, and
 * the provider's own message is the thing worth reading.
 */
async function probePriceProvider(): Promise<Record<string, unknown>> {
  if (!twelveData.isConfigured()) {
    return {
      configured: false,
      note: "TWELVEDATA_API_KEY is not set, so charts and quotes are unavailable.",
    };
  }

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86_400_000);

  try {
    const bars = await twelveData.getBars("AAPL", "1Day", from, to);
    return {
      configured: true,
      working: bars.length > 0,
      barsReturned: bars.length,
      note:
        bars.length > 0
          ? "Price data is working."
          : "The request succeeded but returned no bars for AAPL over the last week.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      working: false,
      // The provider's own wording usually names the cause outright.
      error: message.slice(0, 300),
      note: /api key|apikey|unauthor/i.test(message)
        ? "The API key appears to be invalid."
        : /limit|credit|quota|run out/i.test(message)
          ? "The plan's request limit has been reached. The free plan allows 8 requests/minute and 800/day."
          : "The provider rejected the request.",
    };
  }
}

function describeUrl(url: string): string {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${hostname}:${port || 5432}${pathname}`;
  } catch {
    return "unparseable";
  }
}

function redact(err: unknown): string {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: string }).code;
    if (code) return `${code}: ${(current as Error).message?.split("\n")[0] ?? ""}`.slice(0, 200);
    current = (current as { cause?: unknown }).cause;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/postgres(ql)?:\/\/\S+/gi, "[connection string]").slice(0, 200);
}

function summarize(database: Record<string, unknown>): { state: string; message: string } {
  if (!database.configured) {
    return {
      state: "no-database",
      message:
        "DATABASE_URL is not set on this deployment. Stock pages work; the screener needs it.",
    };
  }
  if (database.reachable === false) {
    return {
      state: "unreachable",
      message: database.internalHostname
        ? "DATABASE_URL uses an internal-only hostname, which cannot be reached from this " +
          "deployment. Enable public access on the database and use its public URL here."
        : `Could not connect to the database. ${database.error ?? ""}`,
    };
  }
  const missing = (database.missingTables as string[]) ?? [];
  if (missing.length > 0) {
    return {
      state: "no-tables",
      message: `Connected, but ${missing.length} table(s) are missing. Run: npm run db:migrate`,
    };
  }
  if ((database.companies as number) === 0) {
    return {
      state: "empty",
      message: "Connected with tables present but no companies. Run: npm run ingest",
    };
  }
  return {
    state: "ok",
    message: `Healthy — ${database.companies} companies loaded.`,
  };
}
