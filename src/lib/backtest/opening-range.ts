import type { Bar } from "../providers/types";

/**
 * Opening Range Breakout, simulated over intraday bars.
 *
 * The rule is the classic one: take the high and low of the first block of a
 * trading session — the opening range — and trade the first break of it. Buy
 * if the price pushes above the range high, sell short if it breaks below,
 * and close the position before the session ends rather than carrying it
 * overnight.
 *
 * This lives in its own module rather than alongside the daily strategies
 * because it cannot be expressed on daily bars at all. A daily bar has one
 * open, high, low and close for the whole session; the opening range is a
 * property of the first fifteen or thirty *minutes* of that session, and is
 * simply not present in the data. Anything calling itself an ORB backtest on
 * daily bars is testing a different rule under a borrowed name.
 *
 * The consequence is a much shorter test. Free intraday history runs about
 * sixty days, so this produces on the order of sixty trades where the daily
 * strategies get ten years — which is nowhere near enough to conclude
 * anything, and is reported as such rather than dressed up with a win rate
 * presented as if it settled the question.
 */

export interface OpeningRangeOptions {
  /** Minutes of the session that form the opening range. */
  rangeMinutes: number;
  /** Minutes per bar in the supplied series. */
  barMinutes: number;
}

/**
 * A gap larger than this starts a new session.
 *
 * Sessions are detected from the spacing of the bars rather than from a
 * calendar date in the exchange's timezone, because the timezone is not
 * something the price providers surface consistently and guessing it wrong
 * would silently split or merge sessions. Four hours sits comfortably above
 * the longest intraday break any major exchange takes — Tokyo and Hong Kong
 * pause around an hour for lunch — and comfortably below the shortest
 * overnight gap, which is over twelve hours even for a market that trades
 * late. Working from the data means this needs no per-exchange knowledge at
 * all.
 */
const SESSION_GAP_SECONDS = 4 * 3600;

export interface OrbTrade {
  /** `YYYY-MM-DD` of the session's opening bar, in UTC. A label, not a key. */
  date: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  /** Signed fraction: positive is a gain for the direction taken. */
  returnPct: number;
  rangeHigh: number;
  rangeLow: number;
}

export interface OrbResult {
  trades: OrbTrade[];
  /** Sessions that had enough bars to form a range and be traded. */
  sessionsTested: number;
  /** Sessions where the price never left the opening range — no trade taken. */
  sessionsWithoutBreakout: number;
  wins: number;
  winRate: number | null;
  /** Compounded return from taking every signal at full size. */
  totalReturn: number;
  averageReturn: number | null;
  /** Best and worst single sessions, for a sense of the spread. */
  bestTrade: number | null;
  worstTrade: number | null;
  series: { time: number; value: number }[];
}

const EMPTY: OrbResult = {
  trades: [],
  sessionsTested: 0,
  sessionsWithoutBreakout: 0,
  wins: 0,
  winRate: null,
  totalReturn: 0,
  averageReturn: null,
  bestTrade: null,
  worstTrade: null,
  series: [],
};

/**
 * Splits a bar series into trading sessions wherever the spacing jumps.
 *
 * Returns them in order, each labelled with the UTC date of its opening bar.
 * That label is for display only — for a market whose session straddles UTC
 * midnight it names the day the session began, which is the more useful of
 * the two answers anyway.
 */
function intoSessions(bars: Bar[]): { date: string; bars: Bar[] }[] {
  if (bars.length === 0) return [];

  const sessions: { date: string; bars: Bar[] }[] = [];
  let current: Bar[] = [bars[0]];

  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time - bars[i - 1].time > SESSION_GAP_SECONDS) {
      sessions.push({
        date: new Date(current[0].time * 1000).toISOString().slice(0, 10),
        bars: current,
      });
      current = [];
    }
    current.push(bars[i]);
  }

  sessions.push({
    date: new Date(current[0].time * 1000).toISOString().slice(0, 10),
    bars: current,
  });

  return sessions;
}

/**
 * Runs the opening-range rule across every complete session in the series.
 *
 * Each session is treated independently and the position always closes on the
 * session's final bar, so no trade ever carries overnight — which is the
 * strategy as defined, and also what keeps gap risk out of a result that
 * never modelled it.
 */
export function runOpeningRangeBreakout(
  bars: Bar[],
  amount: number,
  options: OpeningRangeOptions,
): OrbResult {
  const { rangeMinutes, barMinutes } = options;
  if (bars.length === 0 || barMinutes <= 0 || rangeMinutes < barMinutes) return EMPTY;

  const barsInRange = Math.round(rangeMinutes / barMinutes);
  const sessions = intoSessions(bars);

  const trades: OrbTrade[] = [];
  const series: { time: number; value: number }[] = [];
  let equity = amount;
  let sessionsTested = 0;
  let sessionsWithoutBreakout = 0;

  for (const { date, bars: sessionBars } of sessions) {
    // A session needs its opening range plus at least one bar afterwards to
    // break out into, and one to exit on. Half-days and the truncated session
    // at either end of the fetched window are skipped rather than traded on
    // partial data.
    if (sessionBars.length <= barsInRange + 1) continue;

    sessionsTested++;

    const openingBars = sessionBars.slice(0, barsInRange);
    const rangeHigh = Math.max(...openingBars.map((b) => b.high));
    const rangeLow = Math.min(...openingBars.map((b) => b.low));

    const rest = sessionBars.slice(barsInRange);
    const lastBar = rest[rest.length - 1];

    let trade: OrbTrade | null = null;

    for (const bar of rest) {
      /*
        The first touch wins, and an upward break is checked first.

        A bar whose high clears the range and whose low breaks it is ambiguous
        on this timeframe — the bar does not say which came first — so one has
        to be picked, and picking consistently is what matters. Choosing by
        outcome instead, which is the tempting alternative, would let the
        simulation take whichever side happened to work.
      */
      if (bar.high > rangeHigh) {
        const entryPrice = rangeHigh;
        const exitPrice = lastBar.close;
        trade = {
          date,
          direction: "long",
          entryPrice,
          exitPrice,
          returnPct: exitPrice / entryPrice - 1,
          rangeHigh,
          rangeLow,
        };
        break;
      }
      if (bar.low < rangeLow) {
        const entryPrice = rangeLow;
        const exitPrice = lastBar.close;
        trade = {
          date,
          direction: "short",
          entryPrice,
          exitPrice,
          // Short: the gain is the fall, so the sign flips.
          returnPct: entryPrice / exitPrice - 1,
          rangeHigh,
          rangeLow,
        };
        break;
      }
    }

    if (!trade) {
      sessionsWithoutBreakout++;
      series.push({ time: lastBar.time, value: equity });
      continue;
    }

    trades.push(trade);
    equity *= 1 + trade.returnPct;
    series.push({ time: lastBar.time, value: equity });
  }

  if (trades.length === 0) {
    return { ...EMPTY, sessionsTested, sessionsWithoutBreakout, series };
  }

  const returns = trades.map((t) => t.returnPct);
  const wins = returns.filter((r) => r > 0).length;

  return {
    trades,
    sessionsTested,
    sessionsWithoutBreakout,
    wins,
    winRate: wins / trades.length,
    totalReturn: equity / amount - 1,
    averageReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
    bestTrade: Math.max(...returns),
    worstTrade: Math.min(...returns),
    series,
  };
}

/**
 * How many completed trades before a win rate is worth showing as a number.
 *
 * Sixty sessions of free intraday history yields roughly sixty trades, and a
 * win rate on that sample has an error bar of well over ten percentage
 * points — wide enough that a "58% win rate" and a coin toss are not
 * distinguishable. Below this the figure is still shown, because hiding it
 * would be its own kind of dishonesty, but it is labelled as too small to
 * read anything into.
 */
export const MIN_TRADES_FOR_CONFIDENCE = 200;
