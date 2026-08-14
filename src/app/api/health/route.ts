import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { finnhub, getProvider, providerStatus, twelveData, yahoo } from "@/lib/providers";

export const dynamic = "force-dynamic";

const TABLES = ["companies", "financials", "scores", "price_cache", "ingest_runs"];

/** When this process started — a deploy that never restarted never picked up new code. */
const STARTED_AT = new Date().toISOString();

/**
 * Which commit is actually serving this request.
 *
 * "Is the deployment running the code I just pushed?" has cost this project
 * several debugging rounds in both directions — time spent hunting a bug that
 * was already fixed, and time spent trusting a fix that was never live. Nothing
 * in the app could answer it from the outside, so it stayed a guess.
 *
 * Railway injects the commit it built from; other hosts use their own name for
 * it, so several are read before giving up. Only the short SHA is exposed,
 * which is what a public repository already shows.
 */
function buildInfo(): Record<string, unknown> {
  const sha =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT ||
    null;

  return {
    commit: sha ? sha.slice(0, 7) : "unknown",
    branch: process.env.RAILWAY_GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || null,
    startedAt: STARTED_AT,
    uptimeSeconds: Math.round(process.uptime()),
    note:
      "Compare `commit` against the newest commit on the repository. If it is " +
      "behind, the deployment has not rebuilt and any recent fix is not live yet.",
  };
}

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
      build: buildInfo(),
      database,
      providers: providerStatus(),
      priceData: await probePriceProvider(),
      news: await probeNews(),
      search: await probeSearch(),
      yahooFallback: await yahoo.probe(),
      checkedInMs: Date.now() - started,
    },
    {
      status: status.state === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * Whether Finnhub actually answers with a key set.
 *
 * "News needs a key" was shown whenever the list came back empty, including to
 * operators who had set one — because a refused key and a quiet month produced
 * the same empty array. AMAT is a large, heavily covered company, so an empty
 * result here points at the key or the plan rather than at the company.
 */
async function probeNews(): Promise<Record<string, unknown>> {
  if (!finnhub.isConfigured()) {
    return {
      configured: false,
      note: "FINNHUB_API_KEY is not set, so the news panel stays empty.",
    };
  }

  try {
    const items = await finnhub.getNews("AMAT", 5);
    return {
      configured: true,
      working: items.length > 0,
      articlesReturned: items.length,
      note:
        items.length > 0
          ? "News is working."
          : "The key was accepted but Finnhub returned no articles for AMAT in the " +
            "last 30 days, which is unusual for a company this size — the key may be " +
            "on a plan that excludes company news.",
    };
  } catch (err) {
    return {
      configured: true,
      working: false,
      articlesReturned: 0,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Checks that search can find a company outside SEC coverage.
 *
 * Worth its own probe because it is the one capability that depends on no API
 * key at all, so "it returns nothing" almost always means the deployment is
 * running code from before worldwide search existed, rather than a
 * misconfiguration. ATZ is used as the canary: a real TSX-only ticker that SEC
 * EDGAR will never have.
 */
async function probeSearch(): Promise<Record<string, unknown>> {
  try {
    const results = await getProvider().searchSymbols("ATZ", 8);
    const foreign = results.find((r) => r.symbol.toUpperCase() === "ATZ");

    return {
      worldwideSearch: foreign ? "working" : "not working",
      results: results.length,
      foundForeignListing: Boolean(foreign),
      example: foreign
        ? `${foreign.symbol} — ${foreign.name} (${foreign.exchange ?? "?"})`
        : null,
      note: foreign
        ? "Worldwide search is live; foreign tickers resolve."
        : "ATZ did not resolve. This deployment is most likely running a build " +
          "from before worldwide search was added — redeploy from main.",
    };
  } catch (err) {
    return {
      worldwideSearch: "error",
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
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
