import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { companies, financials, ingestRuns, scores } from "./db/schema";
import { fieldValue } from "./fundamentals/normalize";
import type { CanonicalField, NormalizedFundamentals } from "./fundamentals/types";
import { finnhub, secEdgar, twelveData } from "./providers";
import { cikForSymbol } from "./providers/sec-edgar";
import { sectorFromSic } from "./scoring/applicability";
import { buildHealthReport } from "./scoring/health";
import { div } from "./scoring/math";
import { isCanadian } from "./universe";

/**
 * SEC fair use is 10 requests/second. Each symbol costs two EDGAR calls, so a
 * concurrency of 4 with a small delay keeps well clear of the limit — exceeding
 * it earns roughly a 10 minute IP block.
 */
const CONCURRENCY = 4;
const DELAY_MS = 120;

export interface IngestResult {
  processed: number;
  failed: number;
  errors: { symbol: string; error: string }[];
  durationMs: number;
}

/** Runs `worker` over `items` with bounded concurrency. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
      if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  });

  await Promise.all(runners);
  return results;
}

const FINANCIAL_COLUMNS: CanonicalField[] = [
  "assets", "liabilities", "equity", "currentAssets", "currentLiabilities",
  "cash", "receivables", "inventory", "ppe", "longTermDebt", "shortTermDebt",
  "retainedEarnings", "revenue", "costOfRevenue", "grossProfit", "operatingIncome",
  "netIncome", "incomeBeforeTax", "interestExpense", "sga", "depreciation",
  "operatingCashFlow", "capex", "dividendsPaid", "sharesOutstanding",
];

/**
 * Resolves market capitalisation.
 *
 * Prefers Finnhub's reported figure, then falls back to live price multiplied by
 * the share count from the filings. The fallback matters because market cap
 * drives the P/E, P/B and P/S ratios and the Altman leverage term.
 */
async function resolveMarketCap(
  symbol: string,
  fundamentals: NormalizedFundamentals,
): Promise<number | null> {
  if (finnhub.isConfigured()) {
    const profile = await finnhub.getProfile(symbol).catch(() => null);
    if (profile?.marketCap) return profile.marketCap;
  }

  if (twelveData.isConfigured()) {
    const quote = await twelveData.getQuote(symbol).catch(() => null);
    const shares = fieldValue(fundamentals.annual[0], "sharesOutstanding");
    if (quote?.price && shares) return quote.price * shares;
  }

  return null;
}

/** Fetches, scores and stores one company. */
export async function ingestSymbol(symbol: string): Promise<void> {
  const db = getDb();

  const cik = await cikForSymbol(symbol);
  if (!cik) throw new Error(`no CIK found in EDGAR for ${symbol}`);

  const [fundamentals, profile] = await Promise.all([
    secEdgar.getFundamentalsByCik(cik),
    secEdgar.getProfile(symbol),
  ]);

  if (!fundamentals || fundamentals.annual.length === 0) {
    throw new Error(`no XBRL financial data for ${symbol}`);
  }

  const sector = sectorFromSic(profile?.sicCode);
  const marketCap = await resolveMarketCap(symbol, fundamentals);
  const report = buildHealthReport(fundamentals, sector, marketCap);

  const finnhubProfile = finnhub.isConfigured()
    ? await finnhub.getProfile(symbol).catch(() => null)
    : null;

  // ---- company ----
  const [company] = await db
    .insert(companies)
    .values({
      symbol: symbol.toUpperCase(),
      cik,
      name: profile?.name ?? fundamentals.entityName,
      exchange: finnhubProfile?.exchange ?? profile?.exchange ?? null,
      country: isCanadian(symbol) ? "CA" : (finnhubProfile?.country ?? "US"),
      sicCode: profile?.sicCode ?? null,
      sicDescription: profile?.sicDescription ?? null,
      sectorKind: sector,
      industry: finnhubProfile?.industry ?? profile?.sicDescription ?? null,
      logoUrl: finnhubProfile?.logo ?? null,
      website: finnhubProfile?.website ?? null,
      isCanadian: isCanadian(symbol),
      isActive: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: companies.symbol,
      set: {
        cik,
        name: profile?.name ?? fundamentals.entityName,
        sicCode: profile?.sicCode ?? null,
        sicDescription: profile?.sicDescription ?? null,
        sectorKind: sector,
        industry: finnhubProfile?.industry ?? profile?.sicDescription ?? null,
        logoUrl: finnhubProfile?.logo ?? null,
        website: finnhubProfile?.website ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: companies.id });

  // ---- financials, one row per fiscal year ----
  for (const period of fundamentals.annual) {
    const row: Record<string, unknown> = {
      companyId: company.id,
      fiscalYear: period.fiscalYear,
      endDate: period.end,
      form: period.form,
      currency: period.facts.assets?.unit ?? "USD",
      sourceFilingUrl: period.facts.assets?.sourceFilingUrl ?? null,
    };
    for (const field of FINANCIAL_COLUMNS) {
      row[field] = period.facts[field]?.value ?? null;
    }

    await db
      .insert(financials)
      .values(row as typeof financials.$inferInsert)
      .onConflictDoUpdate({
        target: [financials.companyId, financials.fiscalYear],
        set: Object.fromEntries(
          FINANCIAL_COLUMNS.map((f) => [f, row[f] ?? null]),
        ) as Partial<typeof financials.$inferInsert>,
      });
  }

  // ---- derived screening metrics ----
  const latest = fundamentals.annual[0];
  const prior = fundamentals.annual[1];
  const netIncome = fieldValue(latest, "netIncome");
  const revenue = fieldValue(latest, "revenue");
  const priorRevenue = prior ? fieldValue(prior, "revenue") : null;

  await db
    .insert(scores)
    .values({
      companyId: company.id,
      fiscalYear: report.fiscalYear,
      healthScore: report.score,
      fScore: report.piotroski.score,
      fScoreMax: report.piotroski.maxScore,
      zScore: report.altman.value?.z ?? null,
      zZone: report.altman.value?.zone ?? null,
      zApplicable: report.altman.applicable,
      mScore: report.beneish.value?.m ?? null,
      mFlagged: report.beneish.value?.flagged ?? null,
      mApplicable: report.beneish.applicable,
      marketCap,
      peRatio: netIncome && netIncome > 0 ? div(marketCap, netIncome) : null,
      pbRatio: div(marketCap, fieldValue(latest, "equity")),
      psRatio: div(marketCap, revenue),
      dividendYield: div(
        Math.abs(fieldValue(latest, "dividendsPaid") ?? 0) || null,
        marketCap,
      ),
      revenueGrowth:
        revenue != null && priorRevenue != null && priorRevenue !== 0
          ? (revenue - priorRevenue) / Math.abs(priorRevenue)
          : null,
      netMargin: div(netIncome, revenue),
      returnOnAssets: div(netIncome, fieldValue(latest, "assets")),
      debtToEquity: div(fieldValue(latest, "liabilities"), fieldValue(latest, "equity")),
      currentRatio: div(
        fieldValue(latest, "currentAssets"),
        fieldValue(latest, "currentLiabilities"),
      ),
      questions: report.questions,
      headline: report.headline,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: scores.companyId,
      set: {
        fiscalYear: report.fiscalYear,
        healthScore: report.score,
        fScore: report.piotroski.score,
        fScoreMax: report.piotroski.maxScore,
        zScore: report.altman.value?.z ?? null,
        zZone: report.altman.value?.zone ?? null,
        zApplicable: report.altman.applicable,
        mScore: report.beneish.value?.m ?? null,
        mFlagged: report.beneish.value?.flagged ?? null,
        mApplicable: report.beneish.applicable,
        marketCap,
        peRatio: netIncome && netIncome > 0 ? div(marketCap, netIncome) : null,
        pbRatio: div(marketCap, fieldValue(latest, "equity")),
        psRatio: div(marketCap, revenue),
        revenueGrowth:
          revenue != null && priorRevenue != null && priorRevenue !== 0
            ? (revenue - priorRevenue) / Math.abs(priorRevenue)
            : null,
        netMargin: div(netIncome, revenue),
        returnOnAssets: div(netIncome, fieldValue(latest, "assets")),
        debtToEquity: div(fieldValue(latest, "liabilities"), fieldValue(latest, "equity")),
        currentRatio: div(
          fieldValue(latest, "currentAssets"),
          fieldValue(latest, "currentLiabilities"),
        ),
        questions: report.questions,
        headline: report.headline,
        computedAt: new Date(),
      },
    });
}

/**
 * Ingests a list of symbols, recording the run for auditability.
 *
 * Individual failures are collected rather than aborting the batch: one company
 * with malformed XBRL should not stop the other several hundred.
 */
export async function ingestSymbols(
  symbols: string[],
  onProgress?: (done: number, total: number, symbol: string) => void,
): Promise<IngestResult> {
  const db = getDb();
  const started = Date.now();

  const [run] = await db.insert(ingestRuns).values({ status: "running" }).returning({
    id: ingestRuns.id,
  });

  const errors: { symbol: string; error: string }[] = [];
  let done = 0;

  await mapLimit(symbols, CONCURRENCY, async (symbol) => {
    try {
      await ingestSymbol(symbol);
    } catch (err) {
      errors.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    } finally {
      onProgress?.(++done, symbols.length, symbol);
    }
  });

  const result: IngestResult = {
    processed: symbols.length - errors.length,
    failed: errors.length,
    errors,
    durationMs: Date.now() - started,
  };

  await db
    .update(ingestRuns)
    .set({
      finishedAt: new Date(),
      processed: result.processed,
      failed: result.failed,
      status: errors.length === symbols.length ? "failed" : "completed",
      notes: errors.length
        ? errors.slice(0, 20).map((e) => `${e.symbol}: ${e.error}`).join("; ")
        : null,
    })
    .where(eq(ingestRuns.id, run.id));

  return result;
}

/**
 * Returns the symbols whose scores are most out of date.
 *
 * Used by the refresh endpoint, which processes a bounded slice per call so a
 * single request cannot run for an unbounded time. `npm run ingest` refreshes
 * everything in one pass.
 */
export async function getStaleSymbols(limit: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ symbol: companies.symbol })
    .from(companies)
    .leftJoin(scores, eq(scores.companyId, companies.id))
    .where(eq(companies.isActive, true))
    .orderBy(sql`${scores.computedAt} ASC NULLS FIRST`)
    .limit(limit);

  return rows.map((r) => r.symbol);
}
