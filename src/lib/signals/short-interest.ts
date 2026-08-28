/**
 * What share of the company is sold short.
 *
 * The only figure in this app where somebody has put money on the price
 * falling. A short seller borrows shares, sells them, and has to buy them back
 * later — so the position is a bet, with a real cost of carry, that the shares
 * will be cheaper when that happens. Every other number here describes what a
 * company did; this one describes what a group of people expect.
 *
 * FINRA collects it from broker-dealers twice a month and publishes it about
 * eight days after the settlement date it describes. That lag is not a detail
 * to put in a footnote: a reader who takes this for today's position is
 * reading a fortnight-old number as a live one, so the settlement date leads
 * the panel rather than trailing it.
 *
 * Source: FINRA's consolidated short interest dataset, free and needing no
 * key. Note that FINRA licenses its data for NON-COMMERCIAL use. That is the
 * same wall the free price feeds sit behind, and it means this panel cannot
 * back a paid product without a licence — it is fine for the app as it stands
 * and would need revisiting before charging for anything that includes it.
 *
 * What this is not: a signal to act on. A large short position means informed
 * people disagree with the price, and they are wrong often enough that the
 * squeeze is its own well-known phenomenon. The panel reports the position and
 * says nothing about who will turn out to be right.
 */

const ENDPOINT = "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest";

/**
 * How far back to ask.
 *
 * Reports land twice a month, so a window of a few weeks reliably contains at
 * least one and usually two or three. Wider would mostly return history nobody
 * displays; narrower risks an empty result in the gap between a settlement
 * date and its publication eight days later.
 */
const WINDOW_DAYS = 45;

/** Six hours. The data changes twice a month; this is politeness, not freshness. */
const TTL = 21_600;

/** A short position is only meaningful against the size of the company. */
export interface ShortInterest {
  /** Shares sold short and not yet bought back, at `settlementDate`. */
  shares: number;
  /** The same figure at the previous report, when there was one. */
  previousShares: number | null;
  /** Change since that report, as a fraction. Null on the first report. */
  change: number | null;
  /**
   * Share of the company sold short.
   *
   * Measured against shares outstanding, taken from the latest annual filing,
   * rather than against free float — this app does not ingest float, and
   * quietly substituting one for the other would understate the figure for
   * every company with a large insider or state holding. The label says which
   * it is.
   */
  percentOfShares: number | null;
  /**
   * Days of ordinary trading it would take to buy back every shorted share.
   *
   * FINRA computes this itself from its own average-volume figure, so it is
   * reported as published rather than recomputed here.
   */
  daysToCover: number | null;
  /** The date the position was measured, ISO. Published about 8 days later. */
  settlementDate: string;
}

/** One row of FINRA's consolidated short interest dataset. */
interface FinraRow {
  symbolCode?: string;
  settlementDate?: string;
  currentShortPositionQuantity?: number | null;
  previousShortPositionQuantity?: number | null;
  daysToCoverQuantity?: number | null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The latest short interest report for one symbol, or null when there is none.
 *
 * Null is the ordinary answer for a great many symbols, not a failure: FINRA
 * covers US exchange-listed equities, so a Toronto listing, an ETF share class
 * it does not collect, or a company that listed last month all legitimately
 * have nothing here.
 *
 * The query filters on settlement date as well as symbol because that column
 * is the dataset's partition key — without it the API returns the whole
 * history for the symbol, which is six years of rows to obtain one.
 */
export async function getShortInterest(symbol: string): Promise<ShortInterest | null> {
  const body = {
    limit: 20,
    compareFilters: [
      { fieldName: "symbolCode", fieldValue: symbol.toUpperCase(), compareType: "EQUAL" },
    ],
    dateRangeFilters: [
      {
        fieldName: "settlementDate",
        startDate: isoDaysAgo(WINDOW_DAYS),
        // Deliberately not "today". Settlement dates are stamped in US market
        // time and this may run anywhere, so a window that ends now can miss
        // the most recent report by a few hours.
        endDate: isoDaysAgo(-7),
      },
    ],
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: TTL },
  });

  if (!res.ok) return null;

  const rows: FinraRow[] = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // The API will not sort without an exact settlement date, which is the thing
  // being looked for, so the newest row is picked here instead.
  const latest = rows.reduce<FinraRow | null>((newest, row) => {
    if (!row.settlementDate || finite(row.currentShortPositionQuantity) == null) return newest;
    return !newest || row.settlementDate > newest.settlementDate! ? row : newest;
  }, null);

  if (!latest) return null;

  const shares = finite(latest.currentShortPositionQuantity)!;
  const previousShares = finite(latest.previousShortPositionQuantity);

  return {
    shares,
    previousShares,
    change: previousShares && previousShares > 0 ? (shares - previousShares) / previousShares : null,
    // Filled in by withOwnership below, once the share count is known.
    percentOfShares: null,
    daysToCover: finite(latest.daysToCoverQuantity),
    settlementDate: latest.settlementDate!,
  };
}

/**
 * Expresses the position as a share of the company.
 *
 * Separate from the fetch so the FINRA call can run alongside the fundamentals
 * fetch rather than waiting for it — the share count comes out of the filings,
 * and making one request wait on the other would add a network round trip to
 * every page load for a single division.
 */
export function withOwnership(
  shortInterest: ShortInterest | null,
  sharesOutstanding: number | null,
): ShortInterest | null {
  if (!shortInterest) return null;
  if (!sharesOutstanding || sharesOutstanding <= 0) return shortInterest;

  return { ...shortInterest, percentOfShares: shortInterest.shares / sharesOutstanding };
}
