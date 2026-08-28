/**
 * What analysts have published about the company.
 *
 * The most familiar "prediction" on any other stock site, and the one this app
 * has to handle most carefully, because it arrives pre-packaged as advice. A
 * consensus of "Buy" is a recommendation somebody else made, and the moment it
 * is printed on its own it reads as this app's recommendation instead.
 *
 * So it is never reported as a verdict. What is reported is the distribution —
 * how many analysts said each thing — and, where the source gives them, the
 * spread of their price targets. The spread is the most informative part and
 * the part every other site buries: a consensus target of $324 sounds like a
 * measurement until you see that the estimates behind it run from $210 to
 * $410, at which point it is obviously an average of strong disagreement.
 * Printing the average alone launders that disagreement away.
 *
 * LICENSING. Both sources here are personal, non-commercial licences on the
 * plans this app uses. Finnhub's free tier is issued under a "Personal Use"
 * licence; EODHD's standard plans permit personal use only and require their
 * separate commercial licence to display data in a product. This panel
 * therefore CANNOT back a paid product as it stands — it works, and it must be
 * licensed before anything containing it is charged for. That is the same wall
 * that already blocks charging for the price data.
 */

/** A published set of analyst opinions, as a distribution rather than a verdict. */
export interface AnalystView {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  /** How many analysts are behind the figures above. */
  total: number;
  /**
   * Average published price target, when the source gives one.
   *
   * Null on Finnhub's free tier, which serves the rating distribution but
   * moved price targets to its paid plans. A null here is the ordinary case,
   * not a failure.
   */
  targetPrice: number | null;
  /** The range the individual targets span. Null when unavailable. */
  targetLow: number | null;
  targetHigh: number | null;
  /** The month the ratings describe, ISO. Ratings are republished monthly. */
  asOf: string | null;
  source: string;
}

/** Finnhub's monthly recommendation-trend row. */
interface FinnhubRecommendation {
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
  period?: string;
}

/** The analyst block inside EODHD's fundamentals payload. */
interface EodhdAnalystRatings {
  Rating?: number | string;
  TargetPrice?: number | string;
  StrongBuy?: number | string;
  Buy?: number | string;
  Hold?: number | string;
  Sell?: number | string;
  StrongSell?: number | string;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function toPrice(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Sums the five buckets, so `total` cannot disagree with what is displayed. */
function withTotal(view: Omit<AnalystView, "total">): AnalystView | null {
  const total = view.strongBuy + view.buy + view.hold + view.sell + view.strongSell;
  // No analysts means no distribution to show, and a panel reading "0 analysts
  // say buy" would be a strange way of saying nothing is known.
  return total === 0 ? null : { ...view, total };
}

/**
 * Reads Finnhub's recommendation trends.
 *
 * The endpoint returns one row per month, newest first. Only the newest is
 * used: the older rows are the same analysts' earlier opinions, and averaging
 * a year of them would report a consensus nobody currently holds.
 */
export function parseFinnhubRecommendations(rows: unknown): AnalystView | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const latest = rows.reduce<FinnhubRecommendation | null>((newest, row: FinnhubRecommendation) => {
    if (!row?.period) return newest;
    return !newest || row.period > newest.period! ? row : newest;
  }, null);

  if (!latest) return null;

  return withTotal({
    strongBuy: toCount(latest.strongBuy),
    buy: toCount(latest.buy),
    hold: toCount(latest.hold),
    sell: toCount(latest.sell),
    strongSell: toCount(latest.strongSell),
    // Finnhub moved price targets to its paid plans, so the free tier serves
    // the distribution without them.
    targetPrice: null,
    targetLow: null,
    targetHigh: null,
    asOf: latest.period ?? null,
    source: "Finnhub",
  });
}

/**
 * Reads the analyst block out of EODHD's fundamentals payload.
 *
 * That payload is already fetched for every company when the key is set, so
 * this costs no extra request — the block was simply never mapped. It carries
 * a target price where Finnhub's free tier does not.
 */
export function parseEodhdAnalystRatings(
  ratings: EodhdAnalystRatings | null | undefined,
  asOf: string | null = null,
): AnalystView | null {
  if (!ratings) return null;

  const target = toPrice(ratings.TargetPrice);

  return withTotal({
    strongBuy: toCount(ratings.StrongBuy),
    buy: toCount(ratings.Buy),
    hold: toCount(ratings.Hold),
    sell: toCount(ratings.Sell),
    strongSell: toCount(ratings.StrongSell),
    targetPrice: target,
    // EODHD publishes a single consensus target rather than the range behind
    // it. Reporting low and high as equal to the average would invent a
    // precision — and an agreement — that the payload does not evidence.
    targetLow: null,
    targetHigh: null,
    asOf,
    source: "EODHD",
  });
}

/**
 * How far the average target sits from today's price, as a fraction.
 *
 * Deliberately not called "upside". That word states the price will rise to
 * meet the target, which is precisely the claim this app does not make — the
 * gap is a fact about a published forecast, not about the share.
 */
export function targetGap(view: AnalystView, price: number | null): number | null {
  if (view.targetPrice == null || !price || price <= 0) return null;
  return (view.targetPrice - price) / price;
}
