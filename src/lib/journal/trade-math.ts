/**
 * What a book of trades actually says about the person who made them.
 *
 * The journal used to hold notes: a title, a paragraph, a conviction score.
 * That records what you thought, which is genuinely the hard part to
 * reconstruct later — but it cannot tell you whether you were any good, and
 * "am I actually making money, and from what" is the question a journal is
 * kept to answer.
 *
 * So this module computes the standard trade-review figures from the
 * executions themselves. Every function here is pure and takes plain numbers:
 * nothing reaches a price provider, because these are the reader's own fills,
 * typed in by them. That also keeps the whole feature clear of the market-data
 * licensing that constrains the rest of the app.
 *
 * The one distinction worth naming up front, because it is the reason a
 * journal beats a spreadsheet: a losing trade taken correctly and a winning
 * trade taken by breaking your own rules are different events, and only one of
 * them is a problem. `adherence()` below is what separates them.
 */

export type Side = "long" | "short";

/** One execution, as the reader entered it. Prices are per share. */
export interface Trade {
  id: number;
  symbol: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  /** Null while the position is still open. */
  exitPrice: number | null;
  /** Where the loss was to be cut. Null when none was set. */
  stopPrice: number | null;
  /** Where the gain was to be taken. Null when none was set. */
  targetPrice: number | null;
  /** Commission and everything else, for the whole round trip. */
  fees: number;
  openedAt: string;
  closedAt: string | null;
  playbookId: number | null;
  /** Whether the reader kept to their own rules. Null when not answered. */
  followedRules: boolean | null;
  notes: string;
}

export function isClosed(t: Trade): boolean {
  return t.exitPrice != null && t.closedAt != null;
}

/**
 * Realised profit, net of fees.
 *
 * The side is the whole of it: a short makes money when the exit is *below*
 * the entry, so a single subtraction with the sign hard-coded would report
 * every profitable short as a loss of the same size. Null while the position
 * is open — an unrealised number does not belong in a realised total, and
 * substituting zero would quietly drag every average toward it.
 */
export function realisedPnl(t: Trade): number | null {
  if (!isClosed(t)) return null;
  const move = t.side === "long" ? t.exitPrice! - t.entryPrice : t.entryPrice - t.exitPrice!;
  return move * t.quantity - t.fees;
}

/**
 * What the trade was designed to lose, from entry to stop.
 *
 * The denominator of every R figure below. Null without a stop, which is not
 * a gap in the data so much as a fact about the trade: a position with no
 * predetermined exit has no defined risk, so its result cannot be expressed
 * as a multiple of one. Fees are excluded deliberately — R is about the
 * price idea, and folding costs in makes a 1R winner read as 0.98R for
 * reasons that have nothing to do with the setup.
 */
export function plannedRisk(t: Trade): number | null {
  if (t.stopPrice == null) return null;
  const risk = t.side === "long" ? t.entryPrice - t.stopPrice : t.stopPrice - t.entryPrice;
  // A stop on the wrong side of the entry is not a stop; it is a typo, or a
  // guaranteed loss. Either way there is no risk figure to report.
  return risk > 0 ? risk * t.quantity : null;
}

/** Result as a multiple of what was risked. Null without a stop, or while open. */
export function realisedR(t: Trade): number | null {
  const pnl = realisedPnl(t);
  const risk = plannedRisk(t);
  if (pnl == null || risk == null || risk === 0) return null;
  return pnl / risk;
}

/**
 * The reward-to-risk the trade was taken for, before it played out.
 *
 * Worth keeping beside the realised figure. A book of 3R plans that keeps
 * realising 0.8R is not unlucky — it is being cut early, and no amount of
 * P&L on its own would show that.
 */
export function plannedR(t: Trade): number | null {
  if (t.targetPrice == null || t.stopPrice == null) return null;
  const reward = t.side === "long" ? t.targetPrice - t.entryPrice : t.entryPrice - t.targetPrice;
  const risk = t.side === "long" ? t.entryPrice - t.stopPrice : t.stopPrice - t.entryPrice;
  if (!(risk > 0) || !(reward > 0)) return null;
  return reward / risk;
}

export interface TradeStats {
  closed: number;
  open: number;
  wins: number;
  losses: number;
  /** Exactly flat after fees. Counted apart so it cannot pad the win rate. */
  breakeven: number;

  netPnl: number;
  grossProfit: number;
  /** Positive. The magnitude of everything lost. */
  grossLoss: number;

  /** Wins as a share of closed trades. Null with nothing closed. */
  winRate: number | null;
  /**
   * Gross profit over gross loss.
   *
   * Null when nothing was lost. A book with no losing trade has no ratio —
   * the honest answer is "no losses yet", and printing ∞ or a huge number
   * invites somebody to read a three-trade streak as an edge.
   */
  profitFactor: number | null;
  /** Average profit per closed trade — what one more trade is worth. */
  expectancy: number | null;
  /** The same idea in units of risk, which compares across position sizes. */
  expectancyR: number | null;

  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;

  /** Mean realised R across trades that had a stop. */
  avgR: number | null;
  /** Mean planned R across trades that had both a stop and a target. */
  avgPlannedR: number | null;

  /** Deepest fall in cumulative P&L, as a positive amount. */
  maxDrawdown: number;
  /** Consecutive wins (positive) or losses (negative) at the end of the book. */
  streak: number;
}

const EMPTY: TradeStats = {
  closed: 0, open: 0, wins: 0, losses: 0, breakeven: 0,
  netPnl: 0, grossProfit: 0, grossLoss: 0,
  winRate: null, profitFactor: null, expectancy: null, expectancyR: null,
  avgWin: null, avgLoss: null, largestWin: null, largestLoss: null,
  avgR: null, avgPlannedR: null,
  maxDrawdown: 0, streak: 0,
};

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The part of a summary that only needs a list of results.
 *
 * Extracted so the backtester can produce the same figures from its own round
 * trips. That parity is the point rather than a convenience: the journal says
 * what your trading did and the backtest says what the strategy did, and the
 * two are only comparable if "profit factor" and "expectancy" mean exactly the
 * same arithmetic on both pages. Two implementations of the same word is how
 * they drift.
 *
 * Takes results in the order they happened, because drawdown and streak are
 * about sequence rather than distribution.
 */
export interface PnlStats {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  maxDrawdown: number;
  streak: number;
}

export function statsFromPnls(pnls: number[]): PnlStats {
  if (pnls.length === 0) {
    return {
      count: 0, wins: 0, losses: 0, breakeven: 0,
      netPnl: 0, grossProfit: 0, grossLoss: 0,
      winRate: null, profitFactor: null, expectancy: null,
      avgWin: null, avgLoss: null, largestWin: null, largestLoss: null,
      maxDrawdown: 0, streak: 0,
    };
  }

  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const netPnl = grossProfit - grossLoss;

  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const pnl of pnls) {
    running += pnl;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }

  let streak = 0;
  for (let i = pnls.length - 1; i >= 0; i--) {
    const pnl = pnls[i];
    if (pnl === 0) break;
    if (streak === 0) streak = pnl > 0 ? 1 : -1;
    else if (pnl > 0 && streak > 0) streak++;
    else if (pnl < 0 && streak < 0) streak--;
    else break;
  }

  return {
    count: pnls.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: pnls.length - wins.length - losses.length,
    netPnl,
    grossProfit,
    grossLoss,
    winRate: wins.length / pnls.length,
    // No losses means nothing to divide by. Infinity formats as a number and
    // would read as an edge on a three-trade streak.
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectancy: netPnl / pnls.length,
    avgWin: mean(wins),
    avgLoss: losses.length ? Math.abs(mean(losses)!) : null,
    largestWin: wins.length ? Math.max(...wins) : null,
    largestLoss: losses.length ? Math.abs(Math.min(...losses)) : null,
    maxDrawdown,
    streak,
  };
}

/** Oldest close first, so a cumulative curve runs in the order it happened. */
function byCloseDate(a: Trade, b: Trade): number {
  return (a.closedAt ?? "").localeCompare(b.closedAt ?? "") || a.id - b.id;
}

export function summarise(trades: Trade[]): TradeStats {
  const closed = trades.filter(isClosed).sort(byCloseDate);
  const open = trades.length - closed.length;
  if (closed.length === 0) return { ...EMPTY, open };

  // Shared with the backtester, so the two pages cannot disagree about what
  // "profit factor" means.
  const core = statsFromPnls(closed.map((t) => realisedPnl(t)!));

  const rs = closed.map(realisedR).filter((r): r is number => r != null);
  const plannedRs = closed.map(plannedR).filter((r): r is number => r != null);

  return {
    ...core,
    closed: core.count,
    open,
    expectancyR: mean(rs),
    avgR: mean(rs),
    avgPlannedR: mean(plannedRs),
  };
}

export interface Group {
  key: string;
  label: string;
  stats: TradeStats;
}

function group(trades: Trade[], keyOf: (t: Trade) => string | null): Group[] {
  const buckets = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = keyOf(t);
    if (key == null) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
    else buckets.set(key, [t]);
  }

  return [...buckets.entries()]
    .map(([key, ts]) => ({ key, label: key, stats: summarise(ts) }))
    // Most profitable first: the useful reading is which of these to do more of.
    .sort((a, b) => b.stats.netPnl - a.stats.netPnl);
}

export function bySymbol(trades: Trade[]): Group[] {
  return group(trades, (t) => t.symbol);
}

export function byPlaybook(trades: Trade[], names: Map<number, string>): Group[] {
  return group(trades, (t) => (t.playbookId == null ? null : String(t.playbookId))).map((g) => ({
    ...g,
    label: names.get(Number(g.key)) ?? "Unknown strategy",
  }));
}

/**
 * The comparison the whole journal is for.
 *
 * Splits the book by whether the reader kept to their own rules. A strategy
 * that loses money when followed is a bad strategy; a strategy that makes
 * money when followed and loses it overall is a discipline problem, and the
 * two call for opposite responses. Nothing else in a P&L report distinguishes
 * them, which is why this is worth asking on every trade.
 *
 * Trades where the question was left unanswered are excluded from both sides
 * rather than assumed either way.
 */
export interface Adherence {
  followed: TradeStats;
  broke: TradeStats;
  /** Trades where the question was not answered. */
  unanswered: number;
  /**
   * What breaking the rules cost, per trade, in the reader's own currency.
   * Null unless both sides have a closed trade to compare.
   */
  costPerTrade: number | null;
}

export function adherence(trades: Trade[]): Adherence {
  const followed = summarise(trades.filter((t) => t.followedRules === true));
  const broke = summarise(trades.filter((t) => t.followedRules === false));
  const unanswered = trades.filter((t) => t.followedRules == null && isClosed(t)).length;

  const costPerTrade =
    followed.expectancy != null && broke.expectancy != null
      ? followed.expectancy - broke.expectancy
      : null;

  return { followed, broke, unanswered, costPerTrade };
}

/**
 * The cumulative P&L curve, for drawing.
 *
 * Same ordering as the drawdown above, so the chart and the figure beneath it
 * can never disagree.
 */
export function equityCurve(trades: Trade[]): { date: string; value: number }[] {
  const closed = trades.filter(isClosed).sort(byCloseDate);
  let running = 0;
  return closed.map((t) => {
    running += realisedPnl(t)!;
    return { date: t.closedAt!, value: running };
  });
}
