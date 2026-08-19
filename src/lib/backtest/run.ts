import { getBarsWithSource } from "../providers";
import { yahoo } from "../providers/yahoo";
import { simulateInvestment, type InvestmentError, type InvestmentResult } from "./single-stock";

/** Matches the daily-bar ceiling already used by /api/bars, for the same reason. */
const MAX_DAYS = 365 * 10;

/** The market as a whole is the default yardstick every other comparison chart in this app uses. */
export const DEFAULT_BENCHMARK = "SPY";

export interface SingleStockBacktest {
  symbol: string;
  source: string | null;
  result: InvestmentResult | InvestmentError;
  /**
   * Splits that happened inside the tested window.
   *
   * Carried purely so the page can explain itself. Every price series this
   * app uses is already split-adjusted, so the returns are correct without
   * any of this — but the adjusted figures deliberately do not match what a
   * reader would have seen at the time, and without saying so the result
   * reads as a bug rather than a convention.
   */
  splits: { time: number; ratio: string }[];
  benchmark: {
    symbol: string;
    source: string | null;
    result: InvestmentResult | InvestmentError;
  } | null;
  /**
   * False when dividends could not be fetched at all — Yahoo is the only
   * source for them and it is opt-in. The reader should know a price-only
   * result is not the same claim as a total-return one, not be left to
   * assume reinvestment happened when it silently could not.
   */
  dividendDataAvailable: boolean;
  /**
   * True when the price series itself already has dividends reinvested, so
   * the result is a total return no matter what the reader asked for.
   *
   * Tiingo's adjClose is such a series. Dividends cannot be taken back out of
   * it, which means the "paid out as cash" option cannot be honoured when it
   * is the source — and silently showing a total return under a caption
   * saying otherwise is the kind of small lie that makes every other number
   * on the page worth less.
   */
  dividendsBakedIn: boolean;
}

/**
 * Runs the single-stock and, optionally, the benchmark simulation together,
 * fetching whatever `simulateInvestment` needs and nothing it doesn't.
 *
 * Kept out of the pure module deliberately — see the note there about reuse
 * for the screener backtest, which will drive `simulateInvestment` directly
 * against fundamentals-selected baskets rather than through this fetch layer.
 */
export async function runSingleStockBacktest(
  symbol: string,
  startDate: Date,
  amount: number,
  reinvestDividends: boolean,
  benchmarkSymbol: string | null = DEFAULT_BENCHMARK,
): Promise<SingleStockBacktest> {
  const upper = symbol.toUpperCase();
  const to = new Date();
  const cappedFrom = new Date(Math.max(startDate.getTime(), to.getTime() - MAX_DAYS * 86_400_000));

  const dividendDataAvailable = yahoo.isConfigured();

  const [target, benchmark] = await Promise.all([
    runOne(upper, cappedFrom, to, amount, reinvestDividends),
    benchmarkSymbol
      ? runOne(benchmarkSymbol.toUpperCase(), cappedFrom, to, amount, reinvestDividends)
      : Promise.resolve(null),
  ]);

  return {
    symbol: upper,
    source: target.source,
    result: target.result,
    splits: target.splits,
    benchmark: benchmark
      ? { symbol: benchmarkSymbol!.toUpperCase(), source: benchmark.source, result: benchmark.result }
      : null,
    dividendDataAvailable,
    dividendsBakedIn: target.includesDividends,
  };
}

async function runOne(
  symbol: string,
  from: Date,
  to: Date,
  amount: number,
  reinvestDividends: boolean,
): Promise<{
  source: string | null;
  result: InvestmentResult | InvestmentError;
  splits: { time: number; ratio: string }[];
  includesDividends: boolean;
}> {
  const [bars, dividends] = await Promise.all([
    getBarsWithSource(symbol, "1Day", from, to).catch(
      (err: unknown) => ({
        bars: [],
        source: null,
        includesDividends: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    ),
    yahoo.getCorporateEvents(symbol, from, to).catch(() => ({ dividends: [], splits: [] })),
  ]);

  if ("error" in bars) {
    return { source: null, result: { error: bars.error }, splits: [], includesDividends: false };
  }

  /*
    Dividends are dropped entirely when the price series already carries them.

    Which provider answered decides this, and failover means it is not fixed.
    Tiingo returns adjClose — splits and dividends both — so applying the
    dividend feed on top counted every one twice: SPY from 2020 reported +186%
    where the true total return was about +159%, and the inflated figure looked
    plausible next to a benchmark inflated the same way. Yahoo and Twelve Data
    return price series, where applying them is exactly right.

    Note this drops them rather than merely turning reinvestment off. Not
    reinvesting does not mean not counting: the simulator collects unreinvested
    dividends into a cash balance that still lands in the final value, so
    flipping that flag alone would have left most of the double count in place.
  */
  const dividendsToApply = bars.includesDividends ? [] : dividends.dividends;

  return {
    source: bars.source,
    result: simulateInvestment(bars.bars, dividendsToApply, from, amount, reinvestDividends),
    // Splits were already being fetched alongside dividends and thrown away.
    // They change nothing about the arithmetic — the price series is already
    // split-adjusted — but a reader who remembers NVDA trading near $300 in
    // 2022 needs to be told why this says they bought at $30, or the whole
    // result looks wrong.
    splits: dividends.splits,
    includesDividends: bars.includesDividends,
  };
}
