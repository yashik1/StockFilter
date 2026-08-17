import type { Bar } from "../providers/types";
import { nearestBar } from "../chart-markers";

/**
 * "What if I had invested $X in this stock on this date?"
 *
 * Pure and synchronous by design. Bars and dividends are supplied rather than
 * fetched, so this can be tested without a network call, and reused as-is by
 * the screener backtest's per-holding return calculation later — buying one
 * basket member is the same arithmetic as buying one stock.
 *
 * Assumes `bars` are split-adjusted, which both of this app's price sources
 * are by default: Twelve Data's time series defaults to `adjust=splits`, and
 * Yahoo's `close` field (not `adjclose`, which is also dividend-adjusted) is
 * confirmed split-adjusted by checking it directly against NVDA's real 10:1
 * split — its closes run smoothly through 2024-06-10 rather than jumping
 * roughly tenfold. Because of that, no explicit split handling is needed
 * here: a share count computed against an adjusted close already carries the
 * post-split quantity. Dividends are the opposite case — the close series is
 * *not* dividend-adjusted, so reinvestment has to be simulated explicitly, or
 * total return would be understated for anything that pays one.
 */

export interface InvestmentPoint {
  /** Epoch seconds, matching the underlying bar. */
  time: number;
  /** Shares held times that day's close, plus any dividend cash not reinvested. */
  value: number;
  /** Shares held as of this point, after any reinvestment up to it. */
  shares: number;
}

export interface InvestmentResult {
  /** The bar actually used to buy in. */
  startTime: number;
  endTime: number;
  /**
   * True when the requested start date was earlier than the first available
   * bar, so the simulation began later than asked. Surfaced rather than
   * silently substituted, the same way a range clamp elsewhere in this app is
   * always stated rather than assumed.
   */
  startedLate: boolean;
  initialAmount: number;
  finalValue: number;
  /** Fraction of the initial amount, e.g. 0.85 for +85%. */
  totalReturn: number;
  /**
   * Annualised return. Null under a month of history, where annualising a
   * few weeks of price movement is driven almost entirely by noise rather
   * than by anything about the company.
   */
  cagr: number | null;
  /** Cash dividends collected rather than reinvested. Zero when reinvested. */
  dividendsReceived: number;
  reinvested: boolean;
  series: InvestmentPoint[];
}

export type InvestmentError = { error: string };

export function isInvestmentError(
  result: InvestmentResult | InvestmentError,
): result is InvestmentError {
  return "error" in result;
}

/** Below this many days, an annualised figure says more about noise than about the stock. */
const MIN_DAYS_FOR_CAGR = 30;
const DAY_SECONDS = 86_400;
const DAYS_PER_YEAR = 365.25;

export function simulateInvestment(
  bars: Bar[],
  dividends: { time: number; amount: number }[],
  startDate: Date,
  amount: number,
  reinvestDividends: boolean,
): InvestmentResult | InvestmentError {
  if (bars.length === 0) {
    return { error: "No price history is available for this symbol." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "The amount invested must be a positive number." };
  }

  const startSeconds = Math.floor(startDate.getTime() / 1000);
  const startIndex = bars.findIndex((b) => b.time >= startSeconds);
  if (startIndex === -1) {
    return { error: "The start date is after the last available price." };
  }

  const startBar = bars[startIndex];
  if (!(startBar.close > 0)) {
    return { error: "The price on the start date is not a usable number." };
  }

  const window = bars.slice(startIndex);
  const lastBar = window[window.length - 1];

  // Dividends outside the window are dropped rather than snapped to an edge
  // bar — one paid before the purchase or after the window ends was never
  // received by this holding, and counting it would overstate the return.
  const dividendPerBarTime = new Map<number, number>();
  for (const d of dividends) {
    if (d.time < startBar.time || d.time > lastBar.time) continue;
    const snapped = nearestBar(window, d.time);
    dividendPerBarTime.set(snapped, (dividendPerBarTime.get(snapped) ?? 0) + d.amount);
  }

  let shares = amount / startBar.close;
  // Dividends collected but not reinvested — a running cash balance that sits
  // alongside the share value rather than compounding into more shares.
  let cashPile = 0;

  const series: InvestmentPoint[] = [];
  for (const bar of window) {
    const perShare = dividendPerBarTime.get(bar.time);
    if (perShare) {
      if (reinvestDividends) {
        const proceeds = shares * perShare;
        shares += proceeds / bar.close;
      } else {
        cashPile += shares * perShare;
      }
    }
    series.push({ time: bar.time, value: shares * bar.close + cashPile, shares });
  }

  const finalValue = shares * lastBar.close + cashPile;
  const totalReturn = finalValue / amount - 1;

  const windowDays = (lastBar.time - startBar.time) / DAY_SECONDS;
  const years = windowDays / DAYS_PER_YEAR;
  const cagr =
    windowDays >= MIN_DAYS_FOR_CAGR && years > 0
      ? (finalValue / amount) ** (1 / years) - 1
      : null;

  return {
    startTime: startBar.time,
    endTime: lastBar.time,
    startedLate: startBar.time > startSeconds,
    initialAmount: amount,
    finalValue,
    totalReturn,
    cagr,
    dividendsReceived: cashPile,
    reinvested: reinvestDividends,
    series,
  };
}
