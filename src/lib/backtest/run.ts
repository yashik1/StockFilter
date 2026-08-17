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
    benchmark: benchmark
      ? { symbol: benchmarkSymbol!.toUpperCase(), source: benchmark.source, result: benchmark.result }
      : null,
    dividendDataAvailable,
  };
}

async function runOne(
  symbol: string,
  from: Date,
  to: Date,
  amount: number,
  reinvestDividends: boolean,
): Promise<{ source: string | null; result: InvestmentResult | InvestmentError }> {
  const [bars, dividends] = await Promise.all([
    getBarsWithSource(symbol, "1Day", from, to).catch(
      (err: unknown) => ({
        bars: [],
        source: null,
        error: err instanceof Error ? err.message : String(err),
      }),
    ),
    yahoo.getCorporateEvents(symbol, from, to).catch(() => ({ dividends: [], splits: [] })),
  ]);

  if ("error" in bars) {
    return { source: null, result: { error: bars.error } };
  }

  return {
    source: bars.source,
    result: simulateInvestment(bars.bars, dividends.dividends, from, amount, reinvestDividends),
  };
}
