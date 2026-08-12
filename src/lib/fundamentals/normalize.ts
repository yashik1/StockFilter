import {
  ANNUAL_FORMS,
  CONCEPT_MAP,
  DURATION_FIELDS,
  MUST_BE_POSITIVE,
} from "./concept-map";
import type {
  CanonicalField,
  Fact,
  FinancialPeriod,
  NormalizedFundamentals,
  SecCompanyFacts,
  SecFactEntry,
  Taxonomy,
} from "./types";

/** Max years of annual history retained per company. */
const MAX_YEARS = 12;

/** A duration fact counts as annual when it spans roughly a year. */
const MIN_ANNUAL_DAYS = 340;
const MAX_ANNUAL_DAYS = 400;

const MS_PER_DAY = 86_400_000;

function daysBetween(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / MS_PER_DAY;
}

/**
 * Builds the EDGAR filing index URL for an accession number.
 * Returns null when the accession number is missing or malformed.
 */
export function filingUrl(cik: string | number, accn?: string): string | null {
  if (!accn) return null;
  const bare = accn.replace(/-/g, "");
  if (bare.length !== 18) return null;
  const cikNum = String(Number(cik));
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${accn}-index.htm`;
}

/**
 * Picks the unit series to read for a concept.
 *
 * Monetary values are preferred in USD, then CAD (Canadian filers frequently
 * report in their home currency), then any remaining currency. Share counts fall
 * back to the `shares` unit.
 */
function pickUnit(units: Record<string, SecFactEntry[]>): [string, SecFactEntry[]] | null {
  const keys = Object.keys(units);
  if (keys.length === 0) return null;

  const preference = ["USD", "CAD", "shares", "pure"];
  for (const p of preference) {
    if (units[p]?.length) return [p, units[p]];
  }
  // Fall back to whichever series carries the most observations.
  let best = keys[0];
  for (const k of keys) {
    if ((units[k]?.length ?? 0) > (units[best]?.length ?? 0)) best = k;
  }
  return units[best]?.length ? [best, units[best]] : null;
}

/**
 * Chooses between two observations of the same field in the same fiscal year.
 * The most recently filed value wins so that restatements supersede originals.
 */
function isBetter(candidate: SecFactEntry, incumbent: SecFactEntry): boolean {
  const filedDiff = (candidate.filed ?? "").localeCompare(incumbent.filed ?? "");
  if (filedDiff !== 0) return filedDiff > 0;
  return (candidate.end ?? "").localeCompare(incumbent.end ?? "") > 0;
}

/**
 * Extracts the best annual observation of one canonical field per fiscal year.
 *
 * Note: `fy`/`fp` in the SEC payload describe the *filing* a fact appeared in,
 * not the period the fact covers, so periods are keyed off the `end` date
 * instead. Duration facts are additionally length-checked so that quarterly
 * figures reported inside an annual filing are not mistaken for full-year ones.
 */
function extractField(
  facts: SecCompanyFacts["facts"],
  cik: number,
  field: CanonicalField,
): Map<number, Fact> {
  const isDuration = DURATION_FIELDS.has(field);
  /** Year -> best observation so far, plus the preference rank that supplied it. */
  const byYear = new Map<number, { entry: SecFactEntry; fact: Fact; rank: number }>();

  const concepts = CONCEPT_MAP[field];
  for (let rank = 0; rank < concepts.length; rank++) {
    const concept = concepts[rank];
    for (const [taxonomy, concepts] of Object.entries(facts)) {
      const node = concepts[concept];
      if (!node?.units) continue;

      const picked = pickUnit(node.units);
      if (!picked) continue;
      const [unit, entries] = picked;

      for (const entry of entries) {
        if (!entry.form || !ANNUAL_FORMS.has(entry.form)) continue;
        if (typeof entry.val !== "number" || !Number.isFinite(entry.val)) continue;
        // Discard filing errors such as a reported share count of zero.
        if (MUST_BE_POSITIVE.has(field) && entry.val <= 0) continue;

        if (isDuration) {
          if (!entry.start) continue;
          const span = daysBetween(entry.start, entry.end);
          if (span < MIN_ANNUAL_DAYS || span > MAX_ANNUAL_DAYS) continue;
        } else if (entry.start) {
          // Instant concepts must not carry a start date.
          continue;
        }

        const year = Number(entry.end.slice(0, 4));
        if (!Number.isFinite(year)) continue;

        const existing = byYear.get(year);
        // A higher-preference concept already supplied this year; leave it alone.
        if (existing && existing.rank < rank) continue;
        // Same concept, competing observations: keep the most recently filed.
        if (existing && existing.rank === rank && !isBetter(entry, existing.entry)) continue;

        byYear.set(year, {
          entry,
          rank,
          fact: {
            value: entry.val,
            unit,
            end: entry.end,
            start: entry.start,
            fiscalYear: year,
            fiscalPeriod: entry.fp ?? "FY",
            form: entry.form,
            sourceConcept: `${taxonomy}:${concept}`,
            sourceFilingUrl: filingUrl(cik, entry.accn),
          },
        });
      }
    }

    // Deliberately no early exit. Filers migrate between concepts over time —
    // Shopify tagged revenue as `RevenueFromContractWithCustomerExcludingAssessedTax`
    // through FY2023 and `Revenues` from FY2024 — so stopping at the first
    // concept that returned anything would silently drop the most recent years.
    // Preference is instead resolved per year via `rank` above.
  }

  return new Map([...byYear].map(([year, v]) => [year, v.fact]));
}

/** Detects the taxonomy a filer predominantly reports under. */
function detectTaxonomy(facts: SecCompanyFacts["facts"]): Taxonomy {
  const usGaap = Object.keys(facts["us-gaap"] ?? {}).length;
  const ifrs = Object.keys(facts["ifrs-full"] ?? {}).length;
  return ifrs > usGaap ? "ifrs-full" : "us-gaap";
}

/**
 * Converts a raw SEC `companyfacts` payload into the canonical model.
 *
 * Two behaviours matter for correctness and are covered by tests:
 *  - `liabilities` is derived as `assets - equity` when the filer never tags it
 *    directly, which is common among `us-gaap` filers.
 *  - Fields that are genuinely absent stay absent. Nothing defaults to zero,
 *    because a zero would silently corrupt every ratio built on top of it.
 */
export function normalizeCompanyFacts(raw: SecCompanyFacts): NormalizedFundamentals {
  const cik = String(raw.cik).padStart(10, "0");
  const taxonomy = detectTaxonomy(raw.facts);

  const fields = Object.keys(CONCEPT_MAP) as CanonicalField[];
  const extracted = new Map<CanonicalField, Map<number, Fact>>();
  for (const field of fields) {
    extracted.set(field, extractField(raw.facts, raw.cik, field));
  }

  // A year is only a real period if the core anchors are present.
  const years = new Set<number>();
  for (const anchor of ["assets", "revenue", "netIncome"] as CanonicalField[]) {
    for (const year of extracted.get(anchor)?.keys() ?? []) years.add(year);
  }

  const annual: FinancialPeriod[] = [...years]
    .sort((a, b) => b - a)
    .slice(0, MAX_YEARS)
    .map((year) => {
      const facts: Partial<Record<CanonicalField, Fact>> = {};
      for (const field of fields) {
        const fact = extracted.get(field)?.get(year);
        if (fact) facts[field] = fact;
      }

      // Derived: total liabilities. Many us-gaap filers (Shopify among them)
      // report assets and equity but never tag `Liabilities`.
      if (!facts.liabilities && facts.assets && facts.equity) {
        facts.liabilities = {
          ...facts.assets,
          value: facts.assets.value - facts.equity.value,
          sourceConcept: "derived:Assets-Equity",
          derived: true,
        };
      }

      // Derived: gross profit, when revenue and cost of revenue are both present.
      if (!facts.grossProfit && facts.revenue && facts.costOfRevenue) {
        facts.grossProfit = {
          ...facts.revenue,
          value: facts.revenue.value - facts.costOfRevenue.value,
          sourceConcept: "derived:Revenue-CostOfRevenue",
          derived: true,
        };
      }

      const anchor = facts.assets ?? facts.revenue ?? facts.netIncome;
      return {
        fiscalYear: year,
        fiscalPeriod: "FY",
        end: anchor?.end ?? `${year}-12-31`,
        form: anchor?.form ?? "10-K",
        facts,
      };
    });

  const latest = annual[0];
  const missingFields = latest
    ? fields.filter((f) => latest.facts[f] === undefined)
    : fields;

  return {
    cik,
    entityName: raw.entityName,
    taxonomy,
    annual,
    missingFields,
  };
}

/** Reads a canonical field from a period, returning null when not reported. */
export function fieldValue(
  period: FinancialPeriod | undefined,
  field: CanonicalField,
): number | null {
  const fact = period?.facts[field];
  return fact ? fact.value : null;
}
