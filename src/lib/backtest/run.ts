import { getBarsWithSource } from "../providers";
import { yahoo } from "../providers/yahoo";
import { simulateInvestment, type InvestmentError, type InvestmentResult } from "./single-stock";

/** Matches the daily-bar ceiling already used by /api/bars, for the same reason. */
const MAX_DAYS = 365 * 10;

/**
 * How much later than requested a window can start before it is worth saying so.
 *
 * Markets close at weekends and on holidays, so a start date of "exactly one
 * year ago" lands on a non-trading day roughly two times in seven and the
 * first real bar is a day or three later. That is not missing history, and
 * captioning it as such put a data-quality warning on almost every row of the
 * holding-period table — noise that trains a reader to ignore the warning
 * when it eventually means something. A week clears the longest ordinary
 * closure comfortably.
 */
const MEANINGFUL_SHORTFALL_DAYS = 7;

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
  /**
   * Why the result starts later than asked, when it does.
   *
   * `"history"` means the symbol genuinely has no prices that far back — a
   * company that listed after the requested date. `"fetch-limit"` means it
   * probably does, and this app simply does not ask for more than ten years.
   *
   * Distinguishing them matters because conflating them produced a confident
   * falsehood: a 2015 backtest of Apple reported that Apple "has no price
   * history back to your chosen date … its earliest available price", of a
   * company that has traded publicly since 1980. The limitation was ours and
   * the sentence blamed the data.
   */
  startedLateBecause: "history" | "fetch-limit" | null;
}

interface FetchedSeries {
  source: string | null;
  bars: Awaited<ReturnType<typeof getBarsWithSource>>["bars"];
  /** Dividends to hand to simulateInvestment — empty when the series already
   *  carries them, so they are never counted twice. See the note below. */
  dividendsToApply: { time: number; amount: number }[];
  splits: { time: number; ratio: string }[];
  includesDividends: boolean;
  error?: string;
}

/**
 * Fetches everything `simulateInvestment` needs for one symbol, once.
 *
 * Split out from the simulation itself so the same fetch can back more than
 * one backtest window over the same symbol — `simulateInvestment` accepts a
 * start date and finds its own starting bar inside whatever series it is
 * given, so running it three times against three different start dates over
 * one already-fetched series costs nothing extra, where fetching three times
 * would triple the provider calls for data that does not change.
 */
async function fetchSeries(symbol: string, from: Date, to: Date): Promise<FetchedSeries> {
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
    return {
      source: null,
      bars: [],
      dividendsToApply: [],
      splits: [],
      includesDividends: false,
      error: bars.error,
    };
  }

  /*
    Dividends are dropped entirely when the price series already carries them.

    Which provider answered decides this, and failover means it is not fixed.
    Tiingo returns adjClose — splits and dividends both — so applying the
    dividend feed on top counted every one twice: SPY from 2020 reported +186%
    where the true total return was about +159%. Yahoo and Twelve Data return
    price series, where applying them is exactly right.

    Note this drops them rather than merely turning reinvestment off. Not
    reinvesting does not mean not counting: the simulator collects unreinvested
    dividends into a cash balance that still lands in the final value, so
    flipping that flag alone would have left most of the double count in place.
  */
  const dividendsToApply = bars.includesDividends ? [] : dividends.dividends;

  return {
    source: bars.source,
    bars: bars.bars,
    dividendsToApply,
    // Splits were already being fetched alongside dividends and thrown away.
    // They change nothing about the arithmetic — the price series is already
    // split-adjusted — but a reader who remembers NVDA trading near $300 in
    // 2022 needs to be told why this says they bought at $30, or the whole
    // result looks wrong.
    splits: dividends.splits,
    includesDividends: bars.includesDividends,
  };
}

/**
 * Runs one symbol's actual-dollar backtest: bars and dividends fetched, then
 * `simulateInvestment` run once against the requested start date.
 */
export async function runSingleStockBacktest(
  symbol: string,
  startDate: Date,
  amount: number,
  reinvestDividends: boolean,
): Promise<SingleStockBacktest> {
  const upper = symbol.toUpperCase();
  const to = new Date();
  const cappedFrom = new Date(Math.max(startDate.getTime(), to.getTime() - MAX_DAYS * 86_400_000));

  const dividendDataAvailable = yahoo.isConfigured();
  const series = await fetchSeries(upper, cappedFrom, to);

  if (series.error) {
    return {
      symbol: upper,
      source: null,
      result: { error: series.error },
      splits: [],
      dividendDataAvailable,
      dividendsBakedIn: false,
      startedLateBecause: null,
    };
  }

  const result = simulateInvestment(
    series.bars,
    series.dividendsToApply,
    cappedFrom,
    amount,
    reinvestDividends,
  );

  /*
    The fetch ceiling is checked first and wins.

    `cappedFrom` only differs from the requested date when the ten-year cap
    bit, and when it did, that is the whole reason the reader did not get the
    window they asked for — whatever the series then does inside it. Reporting
    the symbol's own history as the cause in that case is what produced the
    claim that Apple has no prices before 2016.
  */
  const startedLateBecause: SingleStockBacktest["startedLateBecause"] =
    cappedFrom.getTime() > startDate.getTime()
      ? "fetch-limit"
      : !("error" in result) && result.startedLate
        ? "history"
        : null;

  return {
    symbol: upper,
    source: series.source,
    result,
    splits: series.splits,
    dividendDataAvailable,
    dividendsBakedIn: series.includesDividends,
    startedLateBecause,
  };
}

/** Standard holding periods, all ending today. Capped at 10 years to match
 *  `MAX_DAYS` — the same ceiling every backtest in this app already fetches
 *  under, so nothing here asks a provider for history it has never served. */
export const HORIZONS: { label: string; years: number }[] = [
  { label: "1 year", years: 1 },
  { label: "3 years", years: 3 },
  { label: "5 years", years: 5 },
  { label: "10 years", years: 10 },
];

export interface HorizonResult {
  label: string;
  years: number;
  source: string | null;
  result: InvestmentResult | InvestmentError;
  dividendsBakedIn: boolean;
  /**
   * True only when this window is meaningfully shorter than its label — the
   * symbol has no prices reaching that far back. A start date landing on a
   * weekend does not count; see MEANINGFUL_SHORTFALL_DAYS.
   */
  shortOfLabel: boolean;
}

/**
 * Which holding period actually performed best — by annualised rate, never by
 * final value.
 *
 * The distinction is the whole point of ranking these at all. Over unequal
 * lengths the longest window almost always ends with the most money simply
 * because it had the most time, so ranking on final value would make "best"
 * a synonym for "ten years" on every stock ever tested, and say nothing.
 * Annualising puts every window on the same footing.
 *
 * Returns null when nothing has a usable rate — a window too short to
 * annualise reports a null CAGR rather than a made-up one, and if that is all
 * there is then there is no best to name.
 */
export function bestByAnnualised(
  horizons: { result: InvestmentResult | InvestmentError }[],
): { result: InvestmentResult } | null {
  let best: { result: InvestmentResult } | null = null;

  for (const horizon of horizons) {
    const { result } = horizon;
    if ("error" in result || result.cagr == null) continue;
    if (best === null || result.cagr > best.result.cagr!) {
      best = horizon as { result: InvestmentResult };
    }
  }

  return best;
}

/**
 * How the same stock did over several standard holding periods, all ending
 * today — buying it 1, 3, 5 and 10 years ago and holding until now.
 *
 * Comparing a stock against a market index answers "is this a good business
 * relative to everything else" — Compare already does that job, at
 * /compare?symbols=SYMBOL,SPY, without duplicating it here. This answers a
 * different question that only this page can: has this stock's performance
 * been consistent, or was it made entirely by one lucky window? A stock that
 * looks great over 5 years and unremarkable over 10 is a different story than
 * one that looks great over both, and only showing the single date a reader
 * happened to type in would hide that.
 *
 * Fetches the underlying series exactly once, for the longest horizon, and
 * reuses it for every shorter one — see fetchSeries for why that is safe.
 */
export async function runHorizonSweep(
  symbol: string,
  amount: number,
  reinvestDividends: boolean,
): Promise<HorizonResult[]> {
  const upper = symbol.toUpperCase();
  const to = new Date();
  const longestYears = Math.max(...HORIZONS.map((h) => h.years));
  const from = new Date(to.getTime() - longestYears * 365.25 * 86_400_000);

  const series = await fetchSeries(upper, from, to);

  if (series.error) {
    return HORIZONS.map((h) => ({
      label: h.label,
      years: h.years,
      source: null,
      result: { error: series.error! },
      dividendsBakedIn: false,
      shortOfLabel: false,
    }));
  }

  return HORIZONS.map((h) => {
    const start = new Date(to.getTime() - h.years * 365.25 * 86_400_000);
    const result = simulateInvestment(
      series.bars,
      series.dividendsToApply,
      start,
      amount,
      reinvestDividends,
    );

    const shortfallDays =
      "error" in result
        ? 0
        : (result.startTime * 1000 - start.getTime()) / 86_400_000;

    return {
      label: h.label,
      years: h.years,
      source: series.source,
      result,
      dividendsBakedIn: series.includesDividends,
      shortOfLabel: shortfallDays > MEANINGFUL_SHORTFALL_DAYS,
    };
  });
}
