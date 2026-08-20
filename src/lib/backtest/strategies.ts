import type { Bar } from "../providers/types";
import { bollinger, rsi, sma } from "./indicators";

/**
 * Rule-based trading strategies, simulated over daily bars.
 *
 * Everything here is long-or-flat: the strategy is either fully invested or
 * fully in cash, never short. Shorting carries borrow costs, margin calls and
 * theoretically unbounded loss, none of which this simulator models, so
 * including it would produce returns that could not be earned.
 *
 * These are textbook rules, implemented as stated rather than tuned. That is
 * deliberate: a rule fitted until it looks good on the ten years being
 * displayed will look good on those ten years no matter what, which is the
 * single easiest way for a backtest to mislead. The parameters below are the
 * conventional defaults — a 20-day Bollinger band at two deviations, RSI(14)
 * oversold at 30, the 50/200 crossover — and are left alone.
 */

/**
 * The convention every strategy here follows: a signal decided from the data
 * up to and including bar `i` puts the position on at bar `i`'s close, and
 * that position earns the move from bar `i` to bar `i + 1`.
 *
 * The alternative — deciding from bar `i` and also collecting bar `i`'s own
 * move — is look-ahead bias, and it is invisible in the output. It simply
 * makes every strategy look better than it was, most of all the ones that
 * trade on sharp single-day moves, because it lets them buy a day that has
 * already happened. `simulate` below is the only place returns are applied,
 * so the offset lives in exactly one loop rather than in each strategy.
 */
export interface Strategy {
  id: string;
  name: string;
  /** What it is trying to do, in a sentence a non-trader can follow. */
  idea: string;
  /** The literal rule, so the result is never a black box. */
  rule: string;
  /**
   * `true` at index `i` means the position is held into bar `i + 1`.
   * Must be computable from bars 0..i only.
   */
  signals(bars: Bar[]): boolean[];
}

export interface StrategyResult {
  id: string;
  name: string;
  idea: string;
  rule: string;
  finalValue: number;
  totalReturn: number;
  /** Null when the window is too short to annualise meaningfully. */
  cagr: number | null;
  /** Largest peak-to-trough fall in the equity curve, as a positive fraction. */
  maxDrawdown: number;
  /** Completed round trips. A position still open at the end is not counted. */
  trades: number;
  wins: number;
  /** Null when there were no completed trades to take a share of. */
  winRate: number | null;
  /** Share of the tested period actually holding the stock, 0 to 1. */
  timeInMarket: number;
  series: { time: number; value: number }[];
}

const DAY_SECONDS = 86_400;
const DAYS_PER_YEAR = 365.25;
/** Below roughly a season, an annualised figure says more about the window
 *  than the strategy — the same threshold single-stock.ts already uses. */
const MIN_DAYS_FOR_CAGR = 90;

/**
 * Walks a signal series against the bars and produces an equity curve.
 *
 * The one place a return is ever applied, so the "decide at `i`, earn from
 * `i` to `i + 1`" offset is written once and cannot drift between strategies.
 */
export function simulate(
  bars: Bar[],
  signals: boolean[],
  amount: number,
): {
  series: { time: number; value: number }[];
  finalValue: number;
  trades: number;
  wins: number;
  barsHeld: number;
} {
  const series: { time: number; value: number }[] = [];
  let equity = amount;
  let trades = 0;
  let wins = 0;
  let barsHeld = 0;
  let entryPrice: number | null = null;

  series.push({ time: bars[0].time, value: equity });

  for (let i = 1; i < bars.length; i++) {
    const held = signals[i - 1] === true;

    if (held) {
      const change = bars[i].close / bars[i - 1].close - 1;
      equity *= 1 + change;
      barsHeld++;
      if (entryPrice === null) entryPrice = bars[i - 1].close;
    } else if (entryPrice !== null) {
      // Position closed at the previous bar's close, which is the last price
      // it was held at.
      if (bars[i - 1].close > entryPrice) wins++;
      trades++;
      entryPrice = null;
    }

    series.push({ time: bars[i].time, value: equity });
  }

  return { series, finalValue: equity, trades, wins, barsHeld };
}

/** Largest peak-to-trough fall along an equity curve, as a positive fraction. */
export function maxDrawdown(series: { value: number }[]): number {
  let peak = -Infinity;
  let worst = 0;

  for (const point of series) {
    if (point.value > peak) peak = point.value;
    if (peak > 0) {
      const fall = 1 - point.value / peak;
      if (fall > worst) worst = fall;
    }
  }

  return worst;
}

/** Runs one strategy over one series of bars. */
export function runStrategy(strategy: Strategy, bars: Bar[], amount: number): StrategyResult | null {
  if (bars.length < 2) return null;

  const signals = strategy.signals(bars);
  const { series, finalValue, trades, wins, barsHeld } = simulate(bars, signals, amount);

  const windowDays = (bars[bars.length - 1].time - bars[0].time) / DAY_SECONDS;
  const years = windowDays / DAYS_PER_YEAR;

  return {
    id: strategy.id,
    name: strategy.name,
    idea: strategy.idea,
    rule: strategy.rule,
    finalValue,
    totalReturn: finalValue / amount - 1,
    cagr:
      windowDays >= MIN_DAYS_FOR_CAGR && years > 0 ? (finalValue / amount) ** (1 / years) - 1 : null,
    maxDrawdown: maxDrawdown(series),
    trades,
    wins,
    winRate: trades > 0 ? wins / trades : null,
    timeInMarket: bars.length > 1 ? barsHeld / (bars.length - 1) : 0,
    series,
  };
}

const closesOf = (bars: Bar[]) => bars.map((b) => b.close);

/**
 * Buy and hold — the baseline every other strategy has to beat.
 *
 * Included as a strategy rather than assumed, because the honest question is
 * never "did this rule make money" but "did it make more than doing nothing",
 * and a rule that trades constantly to end up behind a single purchase is a
 * result worth seeing plainly.
 */
export const buyAndHold: Strategy = {
  id: "buy-and-hold",
  name: "Buy and hold",
  idea: "Buy once at the start and never sell.",
  rule: "Always invested.",
  signals: (bars) => bars.map(() => true),
};

/**
 * Mean reversion on Bollinger Bands with an RSI filter.
 *
 * The textbook version: buy when the price closes unusually low relative to
 * its own recent volatility *and* momentum agrees it is oversold, then let go
 * once it has climbed back to its average. Requiring both conditions is what
 * separates this from buying every dip — a price can sit below the lower band
 * for weeks in a genuine decline, and RSI is what declines to call that a
 * bargain.
 */
export const meanReversion: Strategy = {
  id: "mean-reversion",
  name: "Mean reversion",
  idea: "Buy when the price falls unusually far below its recent average, sell when it returns to it.",
  rule: "Buy when the close is below the lower Bollinger band (20-day, 2σ) and RSI(14) is under 30. Sell when the close reaches the 20-day average.",
  signals: (bars) => {
    const closes = closesOf(bars);
    const { middle, lower } = bollinger(closes, 20, 2);
    const strength = rsi(closes, 14);

    const out: boolean[] = new Array(bars.length).fill(false);
    let holding = false;

    for (let i = 0; i < bars.length; i++) {
      const close = closes[i];
      const mid = middle[i];
      const low = lower[i];
      const r = strength[i];

      if (!holding) {
        if (low != null && r != null && close < low && r < 30) holding = true;
      } else if (mid != null && close >= mid) {
        holding = false;
      }

      out[i] = holding;
    }

    return out;
  },
};

/**
 * The 50/200 moving-average crossover — the "golden cross" and "death cross".
 *
 * Stateless by construction: the position is simply whether the fast average
 * sits above the slow one, so it never needs to remember whether it is in a
 * trade. Slow to react by design, which is the whole idea — it aims to sit
 * out long declines rather than to catch turns.
 */
export const maCrossover: Strategy = {
  id: "ma-crossover",
  name: "Golden cross",
  idea: "Hold while the short-term average is above the long-term one, stay out otherwise.",
  rule: "Invested whenever the 50-day average is above the 200-day average.",
  signals: (bars) => {
    const closes = closesOf(bars);
    const fast = sma(closes, 50);
    const slow = sma(closes, 200);
    return bars.map((_, i) => {
      const f = fast[i];
      const s = slow[i];
      return f != null && s != null && f > s;
    });
  },
};

/**
 * Connors' RSI(2) — a much faster mean-reversion rule than the Bollinger one.
 *
 * A two-period RSI is extremely twitchy, which is the point: it is looking for
 * a short, sharp drop rather than a sustained one, and exits as soon as the
 * price closes back above a five-day average. Included alongside the slower
 * mean-reversion rule because the two disagree often, and seeing that is more
 * informative than either alone.
 */
export const rsi2: Strategy = {
  id: "rsi-2",
  name: "RSI(2) dip buying",
  idea: "Buy sharp short-term drops, sell as soon as the price recovers.",
  rule: "Buy when the 2-day RSI falls under 10. Sell when the close rises above the 5-day average.",
  signals: (bars) => {
    const closes = closesOf(bars);
    const fastRsi = rsi(closes, 2);
    const exitLine = sma(closes, 5);

    const out: boolean[] = new Array(bars.length).fill(false);
    let holding = false;

    for (let i = 0; i < bars.length; i++) {
      const r = fastRsi[i];
      const line = exitLine[i];

      if (!holding) {
        if (r != null && r < 10) holding = true;
      } else if (line != null && closes[i] > line) {
        holding = false;
      }

      out[i] = holding;
    }

    return out;
  },
};

/**
 * Trend following on the 200-day average.
 *
 * The simplest rule in this set and the one with the longest published
 * history: hold while the price is above its 200-day average, sit in cash
 * below it. It will always give back part of a top and always re-enter after
 * part of a recovery — what it is built to avoid is the long middle of a
 * decline, not the turns.
 */
export const trendFollowing: Strategy = {
  id: "trend-following",
  name: "200-day trend",
  idea: "Hold while the price is above its long-term average, sit in cash below it.",
  rule: "Invested whenever the close is above the 200-day average.",
  signals: (bars) => {
    const closes = closesOf(bars);
    const line = sma(closes, 200);
    return bars.map((_, i) => {
      const l = line[i];
      return l != null && closes[i] > l;
    });
  },
};

/** Every daily strategy, buy-and-hold first so it reads as the baseline. */
export const DAILY_STRATEGIES: Strategy[] = [
  buyAndHold,
  meanReversion,
  rsi2,
  maCrossover,
  trendFollowing,
];

/** Runs the whole set over one series, dropping any that could not run. */
export function runAllStrategies(bars: Bar[], amount: number): StrategyResult[] {
  return DAILY_STRATEGIES.map((s) => runStrategy(s, bars, amount)).filter(
    (r): r is StrategyResult => r !== null,
  );
}
