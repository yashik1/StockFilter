import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { refreshQuotes } from "@/lib/ingest";
import { getUniverse } from "@/lib/universe";

export const dynamic = "force-dynamic";

/**
 * Refreshes stored quotes, which the movers list and sector heatmap read.
 *
 * Kept apart from the fundamentals refresh because prices change constantly
 * while filings change quarterly. Batch size is capped per call so one request
 * cannot run unbounded; `npm run quotes` covers the whole universe in one pass.
 */
const DEFAULT_BATCH = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const requested = Number(new URL(request.url).searchParams.get("limit"));
  const batch =
    Number.isFinite(requested) && requested > 0 ? Math.min(requested, 1000) : DEFAULT_BATCH;

  try {
    const result = await refreshQuotes(getUniverse().slice(0, batch));
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors.slice(0, 5),
    });
  } catch (err) {
    // A rate limit stops the run deliberately rather than grinding through
    // hundreds of guaranteed failures, so report it as such.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Quote refresh failed" },
      { status: 502 },
    );
  }
}
