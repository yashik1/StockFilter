import type { CanonicalField, Fact, FinancialPeriod, NormalizedFundamentals } from "../fundamentals/types";
import type { financials } from "../db/schema";

/**
 * Reconstructs what a company's fundamentals looked like as of a given date —
 * the core operation the screener backtest is built on.
 *
 * Reads from the `financials` table rather than live EDGAR calls. The table
 * already holds one row per (company, fiscal year), each carrying its own
 * `filedAt` from Phase 0, and a backtest needs that same shape repeated across
 * many rebalance dates and every company in the universe — fetching that live
 * from SEC for each combination would be slow and would burn through rate
 * limits for data the ingest job already has. This is the same discipline the
 * live screener already follows: "screening never fans out to external APIs;
 * it queries only this table."
 */

/** Mirrors FINANCIAL_COLUMNS in ingest.ts — the full set of canonical fields the table stores. */
const FINANCIAL_COLUMNS: CanonicalField[] = [
  "assets", "liabilities", "equity", "currentAssets", "currentLiabilities",
  "cash", "receivables", "inventory", "ppe", "longTermDebt", "shortTermDebt",
  "retainedEarnings", "revenue", "costOfRevenue", "grossProfit", "operatingIncome",
  "netIncome", "incomeBeforeTax", "interestExpense", "sga", "depreciation",
  "operatingCashFlow", "capex", "dividendsPaid", "sharesOutstanding",
];

export type FinancialsRow = typeof financials.$inferSelect;

/**
 * Builds a `NormalizedFundamentals` snapshot containing only fiscal years that
 * were actually public as of `asOf`.
 *
 * A row with no `filedAt` — a period ingested before the Phase 0 backfill ran,
 * or one sourced from a fallback provider that carries no filing date at all —
 * is dropped rather than treated as always available. Assuming it was known
 * from day one is exactly the mistake this whole feature exists to avoid: it
 * would score an old backtest date using figures that, as far as this data can
 * say, were never disclosed at all.
 *
 * Returns null when nothing qualifies, which reads as "this company had no
 * public financial history yet" — a real and correct answer for, say, a 2019
 * backtest date applied to a company that only started filing in 2021.
 *
 * `taxonomy` is fixed to `"us-gaap"` because the table does not store it per
 * row. That only affects a display label elsewhere in the app (whether the
 * provenance line reads "US GAAP" or "IFRS") and nothing here reads it for
 * scoring, so the simplification is safe for this internal use.
 */
export function buildPointInTimeFundamentals(
  rows: FinancialsRow[],
  cik: string,
  entityName: string,
  asOf: Date,
): NormalizedFundamentals | null {
  // filedAt is stored as an ISO "YYYY-MM-DD" string, so lexicographic
  // comparison already matches chronological order — no date parsing needed.
  const asOfIso = asOf.toISOString().slice(0, 10);

  const known = rows
    .filter((r): r is FinancialsRow & { filedAt: string } => r.filedAt != null && r.filedAt <= asOfIso)
    .sort((a, b) => b.fiscalYear - a.fiscalYear);

  if (known.length === 0) return null;

  const annual: FinancialPeriod[] = known.map((row) => {
    const facts: Partial<Record<CanonicalField, Fact>> = {};

    for (const field of FINANCIAL_COLUMNS) {
      const value = row[field];
      if (value == null) continue;

      facts[field] = {
        value,
        unit: row.currency ?? "USD",
        end: row.endDate,
        fiscalYear: row.fiscalYear,
        fiscalPeriod: "FY",
        form: row.form ?? "10-K",
        sourceConcept: "stored:financials",
        sourceFilingUrl: row.sourceFilingUrl ?? null,
        filed: row.filedAt,
      };
    }

    return {
      fiscalYear: row.fiscalYear,
      fiscalPeriod: "FY",
      end: row.endDate,
      form: row.form ?? "10-K",
      facts,
      filedAt: row.filedAt,
    };
  });

  return { cik, entityName, taxonomy: "us-gaap", annual, missingFields: [] };
}
