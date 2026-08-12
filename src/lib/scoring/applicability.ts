/**
 * Sector gating for the scoring models.
 *
 * The bankruptcy and manipulation models were derived on industrial and
 * commercial companies. Applying them to banks and insurers produces confident
 * nonsense, because those balance sheets are structurally different: they are
 * unclassified (no current/non-current split, so there is no working capital
 * term) and they are leveraged by design, which the models read as distress.
 *
 * This was confirmed empirically against SEC data — Royal Bank of Canada reports
 * no `CurrentAssets` or `CurrentLiabilities` at all.
 *
 * Sector is taken from the SIC code on the SEC submissions endpoint, which is
 * authoritative and free.
 */

export type SectorKind = "financial" | "real-estate" | "manufacturing" | "other";

/**
 * Maps a SIC code to the sector treatment used by the scoring models.
 * See https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list
 */
export function sectorFromSic(sic: string | number | null | undefined): SectorKind {
  const code = Number(sic);
  if (!Number.isFinite(code) || code <= 0) return "other";

  // 6000-6499 depository/credit/insurance, 6712 bank holding companies.
  if (code >= 6000 && code <= 6499) return "financial";
  if (code >= 6700 && code <= 6799) return "financial";
  // 6500-6599 real estate operators and lessors.
  if (code >= 6500 && code <= 6599) return "real-estate";
  // 2000-3999 manufacturing, the population Altman's original Z was fitted on.
  if (code >= 2000 && code <= 3999) return "manufacturing";
  return "other";
}

export function isFinancial(sector: SectorKind): boolean {
  return sector === "financial";
}

/** Human-readable explanation shown wherever a score is suppressed. */
export const FINANCIAL_SUPPRESSION_REASON =
  "Not meaningful for banks, insurers and other financial companies. Their balance sheets " +
  "have no working capital and are leveraged by design, which this model misreads as distress.";

export const INSUFFICIENT_DATA_REASON =
  "This company has not reported enough of the required figures to calculate this score.";
