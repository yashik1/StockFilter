import { eq, inArray } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { companies, financials } from "../db/schema";
import { getBarsWithSource } from "../providers";
import { yahoo } from "../providers/yahoo";
import { getUniverse } from "../universe";
import type { SectorKind } from "../scoring/applicability";
import { runScreenerBacktest, type CandidateData, type ScreenerBacktestResult } from "./screener";

/** Matches the daily-bar ceiling already used elsewhere in this app. */
const MAX_DAYS = 365 * 10;

/**
 * Walks a Drizzle error's `.cause` chain for the real Postgres reason.
 *
 * `DrizzleQueryError.message` is the query text and parameter list, not the
 * failure — mirrors the same fix already applied to /api/health's own
 * database check, and exists for the identical reason: a bare `.message`
 * dumped a several-hundred-character SQL statement with no indication of
 * what actually went wrong.
 */
function rootCause(err: unknown): string {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: string }).code;
    if (code) return `${code}: ${(current as Error).message?.split("\n")[0] ?? ""}`.slice(0, 200);
    current = (current as { cause?: unknown }).cause;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0].slice(0, 200);
}

/**
 * How many symbols' price history are fetched at once.
 *
 * Matches the ingest job's own worker count. Kept modest rather than tuned up:
 * Twelve Data's free tier allows 8 requests a minute, so a wide burst mostly
 * just pushes work onto Finnhub, Tiingo and Yahoo faster than they can be
 * asked politely — the failover chain already absorbs a rate limit on any one
 * of them, so there is little to gain by hurrying it.
 */
const FETCH_CONCURRENCY = 4;

export interface ScreenerBacktestRun {
  result: ScreenerBacktestResult | { error: string };
  /** How many symbols exist in today's screening universe. */
  universeSize: number;
  /** How many of those had both price history and financial history to score with. */
  candidatesScored: number;
  topN: number;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Yearly rebalance dates from `from` to `to`, inclusive of both ends.
 *
 * The final gap is usually shorter than a year — a backtest starting on an
 * arbitrary date rarely lines up with today's calendar date exactly a whole
 * number of years later, and that partial final period is real and should be
 * priced, not dropped.
 */
function yearlyRebalanceDates(from: Date, to: Date): Date[] {
  const dates: Date[] = [new Date(from)];
  let cursor = new Date(from.getFullYear() + 1, from.getMonth(), from.getDate());
  while (cursor < to) {
    dates.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear() + 1, cursor.getMonth(), cursor.getDate());
  }
  dates.push(new Date(to));
  return dates;
}

/**
 * Runs the screener backtest end to end: reads today's universe and its
 * stored fundamentals history from the database, fetches price and dividend
 * history for each symbol, and hands all of it to the pure rebalancing logic
 * in screener.ts.
 *
 * Reads from the database rather than live EDGAR for the same reason the live
 * screener does — this needs every symbol in the universe, not one, and
 * fetching that fresh from SEC for each of several rebalance dates would be
 * slow and would spend a rate limit budget on data the ingest job already
 * has. Prices are the exception: nothing in this app stores multi-year daily
 * history, so those come from the live provider chain, once per symbol,
 * exactly the same call the price charts already make.
 */
export async function runFullScreenerBacktest(
  startDate: Date,
  amount: number,
  topN: number,
): Promise<ScreenerBacktestRun> {
  if (!isDatabaseConfigured()) {
    return {
      result: {
        error:
          "This deployment has no database configured, so there is no stored " +
          "history of past scores to test against.",
      },
      universeSize: 0,
      candidatesScored: 0,
      topN,
    };
  }

  const db = getDb();
  const to = new Date();
  const cappedFrom = new Date(Math.max(startDate.getTime(), to.getTime() - MAX_DAYS * 86_400_000));

  const universe = new Set(getUniverse());
  let inUniverse: { id: number; symbol: string; cik: string | null; name: string; sectorKind: string }[];
  let financialsRows: (typeof financials.$inferSelect)[];

  try {
    const allCompanies = await db
      .select({
        id: companies.id,
        symbol: companies.symbol,
        cik: companies.cik,
        name: companies.name,
        sectorKind: companies.sectorKind,
      })
      .from(companies)
      .where(eq(companies.isActive, true));

    inUniverse = allCompanies.filter((c) => universe.has(c.symbol));

    financialsRows =
      inUniverse.length > 0
        ? await db
            .select()
            .from(financials)
            .where(inArray(financials.companyId, inUniverse.map((c) => c.id)))
        : [];
  } catch (err) {
    // Drizzle wraps the real Postgres reason in `.cause` and puts the whole
    // query text in `.message`, so reading `.message` alone surfaces an
    // opaque SQL dump rather than the actual problem — walk the chain for the
    // Postgres error code instead, the same fix already applied to the health
    // endpoint's own database check.
    return {
      result: { error: `Could not read the stored screening data: ${rootCause(err)}` },
      universeSize: 0,
      candidatesScored: 0,
      topN,
    };
  }

  const rowsByCompany = new Map<number, typeof financialsRows>();
  for (const row of financialsRows) {
    const list = rowsByCompany.get(row.companyId);
    if (list) list.push(row);
    else rowsByCompany.set(row.companyId, [row]);
  }

  const fetched = await mapLimit(inUniverse, FETCH_CONCURRENCY, async (company) => {
    const rows = rowsByCompany.get(company.id) ?? [];
    // No point fetching a symbol's price history if it has no stored
    // financials to score at all — it could never be chosen for the basket.
    if (rows.length === 0) return null;

    const [bars, dividends] = await Promise.all([
      getBarsWithSource(company.symbol, "1Day", cappedFrom, to).catch(() => ({
        bars: [] as CandidateData["bars"],
        source: null,
        includesDividends: false,
      })),
      yahoo
        .getCorporateEvents(company.symbol, cappedFrom, to)
        .catch(() => ({ dividends: [] as CandidateData["dividends"], splits: [] })),
    ]);

    if (bars.bars.length === 0) return null;

    const candidate: CandidateData = {
      symbol: company.symbol,
      cik: company.cik ?? company.symbol,
      entityName: company.name,
      sector: (company.sectorKind as SectorKind | null) ?? "other",
      financialsRows: rows,
      bars: bars.bars,
      /*
        Dropped when this symbol's price series already carries them.

        Same double count as the single-stock backtest, and worse here: the
        source is resolved per symbol, so within one basket some holdings could
        be inflated and others not — an error that does not merely shift the
        strategy's return but reorders which holdings appear to have driven it.
      */
      dividends: bars.includesDividends ? [] : dividends.dividends,
    };
    return candidate;
  });

  const candidates = fetched.filter((c): c is CandidateData => c != null);

  const rebalanceDates = yearlyRebalanceDates(cappedFrom, to);
  const result =
    candidates.length > 0
      ? runScreenerBacktest(candidates, rebalanceDates, amount, topN)
      : { error: "None of today's universe had both stored financials and price history to test with." };

  return {
    result,
    universeSize: inUniverse.length,
    candidatesScored: candidates.length,
    topN,
  };
}
