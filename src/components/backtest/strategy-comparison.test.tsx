import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpeningRangeCard, StrategyComparison } from "./strategy-comparison";
import type { StrategyResult } from "@/lib/backtest/strategies";
import type { OrbResult } from "@/lib/backtest/opening-range";

/**
 * The strategy tables, rendered with real-shaped data.
 *
 * The arithmetic is tested where it lives; what these check is the framing,
 * which is the part that can quietly mislead. A backtest that shows a rule
 * beating the market when it did not, or presents forty intraday trades as
 * though they settled something, is wrong in a way no unit test of the return
 * calculation would catch.
 */

const result = (over: Partial<StrategyResult> = {}): StrategyResult => ({
  id: "mean-reversion",
  name: "Mean reversion",
  idea: "Buy low, sell at the average.",
  rule: "Buy below the lower band, sell at the middle.",
  finalValue: 12_000,
  totalReturn: 0.2,
  cagr: 0.02,
  maxDrawdown: 0.31,
  trades: 13,
  wins: 10,
  winRate: 10 / 13,
  timeInMarket: 0.08,
  series: [],
  ...over,
});

const holding = (over: Partial<StrategyResult> = {}): StrategyResult =>
  result({
    id: "buy-and-hold",
    name: "Buy and hold",
    finalValue: 116_793,
    totalReturn: 10.68,
    cagr: 0.279,
    trades: 0,
    wins: 0,
    winRate: null,
    timeInMarket: 1,
    ...over,
  });

describe("comparing rules against holding", () => {
  it("says plainly when nothing beat buying and holding", () => {
    // The usual outcome, and the one a backtest is most tempted to bury.
    const html = renderToStaticMarkup(
      <StrategyComparison symbol="AAPL" results={[holding(), result()]} amount={10_000} />,
    );
    expect(html).toContain("None of the 1 rules beat");
  });

  it("counts a rule that did beat it, and hedges the claim", () => {
    const html = renderToStaticMarkup(
      <StrategyComparison
        symbol="AAPL"
        results={[holding({ finalValue: 11_000 }), result({ finalValue: 20_000 })]}
        amount={10_000}
      />,
    );
    expect(html).toContain("1 of 1 rules finished ahead");
    // The hedge matters as much as the count: one stock over one window is
    // not evidence the rule works.
    expect(html).toContain("over this window, on this stock");
  });

  it("shows a dash rather than zero trades for buy and hold", () => {
    // Buy and hold never sells, so it has no completed round trip. Printing
    // "0" beside a win rate reads as a rule that traded and lost every time.
    const html = renderToStaticMarkup(
      <StrategyComparison symbol="AAPL" results={[holding()]} amount={10_000} />,
    );
    expect(html).not.toContain(">0<");
  });

  it("prints each rule's actual conditions, so it is not a black box", () => {
    const html = renderToStaticMarkup(
      <StrategyComparison symbol="AAPL" results={[holding(), result()]} amount={10_000} />,
    );
    expect(html).toContain("Buy below the lower band");
  });

  it("degrades to an explanation when there is no history to run on", () => {
    const html = renderToStaticMarkup(
      <StrategyComparison symbol="NEWCO" results={[]} amount={10_000} />,
    );
    expect(html).toContain("Not enough history");
  });
});

const orb = (over: Partial<OrbResult> = {}): OrbResult => ({
  trades: Array.from({ length: 41 }, () => ({
    date: "2026-06-22",
    direction: "long" as const,
    entryPrice: 100,
    exitPrice: 101,
    returnPct: 0.01,
    rangeHigh: 100,
    rangeLow: 95,
  })),
  sessionsTested: 42,
  sessionsWithoutBreakout: 1,
  wins: 18,
  winRate: 18 / 41,
  totalReturn: -0.027,
  averageReturn: -0.0007,
  bestTrade: 0.0235,
  worstTrade: -0.0282,
  series: [],
  ...over,
});

describe("the opening range card", () => {
  it("leads with the sample size when the sample is small", () => {
    /*
      The whole reason this card is separate. Forty trades cannot distinguish
      an edge from a coin toss, and a win rate printed as a headline invites
      exactly that reading — so the caveat sits above the numbers, not under
      them in small print.
    */
    const html = renderToStaticMarkup(
      <OpeningRangeCard
        symbol="AAPL"
        run={{ source: "Yahoo Finance", rangeMinutes: 15, result: orb() }}
        amount={10_000}
      />,
    );
    expect(html).toContain("41 trades is far too few to conclude anything");
    expect(html).toContain("not as evidence that it works or does not");
  });

  it("says how many sessions never broke out at all", () => {
    // Dropping those days would quietly raise the win rate by hiding every
    // session on which the rule found nothing to do.
    const html = renderToStaticMarkup(
      <OpeningRangeCard
        symbol="AAPL"
        run={{ source: "Yahoo Finance", rangeMinutes: 15, result: orb() }}
        amount={10_000}
      />,
    );
    expect(html).toContain("42");
    expect(html).toContain("never left the opening range");
  });

  it("explains rather than blames when intraday data is missing", () => {
    const html = renderToStaticMarkup(
      <OpeningRangeCard
        symbol="XYZ"
        run={{
          source: null,
          rangeMinutes: 15,
          result: orb({ trades: [], sessionsTested: 0 }),
          error: "Intraday prices are not available for XYZ.",
        }}
        amount={10_000}
      />,
    );
    expect(html).toContain("No intraday history available");
    expect(html).toContain("not available for XYZ");
  });

  it("discloses that shorting is modelled without its real costs", () => {
    const html = renderToStaticMarkup(
      <OpeningRangeCard
        symbol="AAPL"
        run={{ source: "Yahoo Finance", rangeMinutes: 15, result: orb() }}
        amount={10_000}
      />,
    );
    expect(html).toContain("borrow costs");
  });
});
