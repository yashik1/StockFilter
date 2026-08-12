import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { getStaleSymbols, ingestSymbols } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * How many symbols one invocation refreshes.
 *
 * Sized to finish inside the function timeout. Each symbol costs two EDGAR
 * calls plus a market cap lookup, and the ingest runs four at a time with a
 * small delay to stay under the SEC's 10 req/s fair-use limit.
 *
 * The whole universe therefore refreshes over several days on Vercel alone.
 * For a nightly full pass, run `scripts/ingest.ts` from GitHub Actions instead
 * (see .github/workflows/ingest.yml) — Vercel Hobby crons fire only once a day
 * and cannot run long enough to cover everything.
 */
const BATCH_SIZE = 60;

export async function GET(request: Request) {
  // Vercel signs cron invocations with CRON_SECRET. Reject anything else so the
  // endpoint cannot be used to burn the SEC rate limit from outside.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 503 },
    );
  }

  try {
    const symbols = await getStaleSymbols(BATCH_SIZE);
    if (symbols.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No companies seeded yet. Run scripts/ingest.ts to populate the universe.",
      });
    }

    const result = await ingestSymbols(symbols);
    return NextResponse.json({
      ok: true,
      refreshed: result.processed,
      failed: result.failed,
      durationMs: result.durationMs,
      symbols,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
