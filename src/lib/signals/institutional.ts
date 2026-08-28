import { desc, eq, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { companies, institutionalHoldings } from "../db/schema";

/**
 * Who owns the company, from Form 13F.
 *
 * Every institutional manager holding more than $100M in US equities files one
 * each quarter, listing every position. It is the closest thing to a public
 * record of what large investors are actually doing — not what they say in an
 * interview, but the positions they were carrying on a given date.
 *
 * It is also late. Filings are due 45 days after the quarter ends, so the
 * freshest possible figure describes a position held six weeks ago and the
 * usual one is older still. A manager may have sold the entire holding the day
 * after the quarter closed and nothing here would show it. So this is history,
 * and the panel says so where a reader cannot miss it rather than in a
 * footnote — presenting a 45-day-old snapshot as what somebody "is betting"
 * would be the exact error the rest of this section exists to avoid.
 *
 * Two more limits worth knowing, both stated in the panel: 13F covers long
 * positions in US-listed equities only, so a manager's shorts, bonds and
 * foreign holdings are invisible, and a filer can request confidential
 * treatment to delay disclosing a position it is still building.
 *
 * Public domain, with no licensing restriction of any kind — the only source
 * in this section that is free of one.
 */

/** How many holders are kept per company per quarter. See schema.ts. */
export const TOP_HOLDERS = 10;

export interface InstitutionalHolder {
  name: string;
  cik: string;
  shares: number | null;
  value: number | null;
  /**
   * Change in shares since the previous quarter on file.
   *
   * Null when the manager did not appear last quarter, which means either that
   * it opened the position or that it simply was not among the holders kept —
   * two situations this data cannot tell apart, so neither is claimed.
   */
  change: number | null;
}

export interface InstitutionalOwnership {
  /** The quarter held on, ISO. Always at least six weeks in the past. */
  quarter: string;
  /** Every manager that reported the company, not only those listed below. */
  holderCount: number | null;
  /** Shares held by all of them. */
  totalShares: number | null;
  /** Share of the company they hold between them, when the count is known. */
  percentOfShares: number | null;
  holders: InstitutionalHolder[];
}

/** A raw 13F holdings row, in the columns the SEC's INFOTABLE.tsv uses. */
export interface InfoTableRow {
  CUSIP: string;
  SSHPRNAMT: string;
  SSHPRNAMTTYPE: string;
  PUTCALL: string;
  VALUE: string;
  ACCESSION_NUMBER: string;
}

/**
 * Whether a 13F line is a shareholding at all.
 *
 * Two columns decide it, and ignoring either produces a number that looks
 * right and is not. `PUTCALL` marks the row as an option rather than stock —
 * counting a put as a holding would record a bet *against* the company as
 * ownership of it, which is backwards. `SSHPRNAMTTYPE` distinguishes a share
 * count (`SH`) from a principal amount (`PRN`), and adding a bond's face value
 * to a share count produces a total in no unit at all.
 */
export function isShareholding(row: Record<string, string | undefined>): boolean {
  return row.SSHPRNAMTTYPE?.trim().toUpperCase() === "SH" && !row.PUTCALL?.trim();
}

/**
 * Turns the SEC's `31-MAR-2026` into `2026-03-31`.
 *
 * Returns null rather than an invalid date for anything unrecognised, so a
 * format change upstream drops rows instead of writing a quarter nothing can
 * query.
 */
export function normalizeQuarter(raw: string): string | null {
  const MONTHS: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };

  const match = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(raw?.trim().toUpperCase() ?? "");
  if (!match) return null;

  const month = MONTHS[match[2]];
  return month ? `${match[3]}-${month}-${match[1]}` : null;
}

/** One manager's position, as the ingest accumulates it. */
export interface AggregatedPosition {
  cik: string;
  name: string;
  shares: number;
  value: number;
}

/** One filing's total for one security, before amendments are resolved. */
export interface FilingPosition {
  accession: string;
  shares: number;
  value: number;
  /** True when the cover page marks this a RESTATEMENT amendment. */
  isRestatement: boolean;
  /** Filing date, ISO, used only to order competing restatements. */
  filedAt: string;
}

/**
 * One manager's true position, given every filing it made for that quarter.
 *
 * This exists because the obvious implementation — add up every row for the
 * manager — is wrong, and wrong in a way that looks entirely plausible.
 *
 * Vanguard's Q1 2026 report on Apple is the worked example. It appears twice
 * under one CIK with an identical 953,847,648 shares: once as the original
 * filing and once as a RESTATEMENT amendment. Summing them credits Vanguard
 * with 1.9bn shares and puts Apple's institutional ownership at 70% of the
 * company, against the ~63% it actually is. Every large holder of every large
 * company has this shape, so the error is systematic rather than occasional.
 *
 * A restatement replaces what was filed before, so the latest one wins
 * outright. Anything else is summed: a manager legitimately files several
 * lines for one security when it holds it across different discretion
 * categories, and a NEW HOLDINGS amendment genuinely adds to the original
 * rather than superseding it.
 */
export function resolveManagerPosition(filings: FilingPosition[]): {
  shares: number;
  value: number;
} {
  const restatements = filings.filter((f) => f.isRestatement);

  if (restatements.length > 0) {
    // Latest by filing date, falling back to accession number, which the SEC
    // issues in ascending order within a filer.
    const winner = restatements.reduce((latest, f) =>
      f.filedAt > latest.filedAt ||
      (f.filedAt === latest.filedAt && f.accession > latest.accession)
        ? f
        : latest,
    );
    return { shares: winner.shares, value: winner.value };
  }

  return filings.reduce(
    (total, f) => ({ shares: total.shares + f.shares, value: total.value + f.value }),
    { shares: 0, value: 0 },
  );
}

export interface CompanyQuarterSummary {
  holderCount: number;
  totalShares: number;
  top: AggregatedPosition[];
}

/**
 * Ranks a company's holders and keeps only the largest.
 *
 * The counts are taken before the list is cut, so "8,538 institutions hold it"
 * remains true even though ten rows are stored. Computing it from the stored
 * rows afterwards would report ten.
 */
export function summarisePositions(
  positions: Iterable<AggregatedPosition>,
  keep = TOP_HOLDERS,
): CompanyQuarterSummary {
  let holderCount = 0;
  let totalShares = 0;
  const all: AggregatedPosition[] = [];

  for (const position of positions) {
    holderCount++;
    totalShares += position.shares;
    all.push(position);
  }

  all.sort((a, b) => b.shares - a.shares);
  return { holderCount, totalShares, top: all.slice(0, keep) };
}

/**
 * The most recent quarter on file for one company, with each holder's move.
 *
 * Reads the two most recent quarters in one query and pairs them up, so a
 * holder that added or trimmed can be shown as such. A company with only one
 * quarter ingested reports no changes rather than implying every position is
 * new.
 */
export async function getInstitutionalOwnership(
  symbol: string,
  sharesOutstanding: number | null,
): Promise<InstitutionalOwnership | null> {
  if (!isDatabaseConfigured()) return null;

  const rows = await getDb()
    .select({
      quarter: institutionalHoldings.quarter,
      managerCik: institutionalHoldings.managerCik,
      managerName: institutionalHoldings.managerName,
      shares: institutionalHoldings.shares,
      value: institutionalHoldings.value,
      holderCount: institutionalHoldings.holderCount,
      totalShares: institutionalHoldings.totalShares,
    })
    .from(institutionalHoldings)
    .innerJoin(companies, eq(companies.id, institutionalHoldings.companyId))
    .where(eq(sql`upper(${companies.symbol})`, symbol.toUpperCase()))
    .orderBy(desc(institutionalHoldings.quarter), desc(institutionalHoldings.shares));

  if (rows.length === 0) return null;

  /*
    Every quarter on file is fetched and the two most recent picked here,
    rather than asked for in SQL. Only the top holders are stored, so a
    company's whole history is a few dozen rows — small enough that a
    correlated subquery to avoid reading them would cost more than it saves,
    and this version cannot get the correlation subtly wrong.
  */
  const latest = rows[0].quarter;
  const priorQuarter = rows.find((r) => r.quarter !== latest)?.quarter;
  const current = rows.filter((r) => r.quarter === latest);
  const previous = new Map(
    rows.filter((r) => r.quarter === priorQuarter).map((r) => [r.managerCik, r.shares]),
  );

  const totalShares = current[0]?.totalShares ?? null;

  return {
    quarter: latest,
    holderCount: current[0]?.holderCount ?? null,
    totalShares,
    percentOfShares:
      totalShares != null && sharesOutstanding && sharesOutstanding > 0
        ? totalShares / sharesOutstanding
        : null,
    holders: current.map((r) => {
      const before = previous.get(r.managerCik);
      return {
        name: r.managerName,
        cik: r.managerCik,
        shares: r.shares,
        value: r.value,
        change:
          before != null && before > 0 && r.shares != null ? (r.shares - before) / before : null,
      };
    }),
  };
}
