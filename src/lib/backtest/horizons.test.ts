import { describe, expect, it } from "vitest";
import { bestByAnnualised, HORIZONS } from "./run";
import { isInvestmentError, simulateInvestment } from "./single-stock";
import type { Bar } from "../providers/types";

/**
 * Comparing one stock against itself over different holding periods.
 *
 * This replaced the SPY benchmark on the single-stock backtest. Comparing a
 * holding against an index is what /compare exists for; what only this page
 * can answer is whether a result was consistent or whether one window carried
 * it. The ranking rule below is the part worth pinning, because the obvious
 * implementation of it is wrong.
 */

const DAY = 86_400;
const START = 1_700_000_000;

const bar = (time: number, close: number): Bar => ({
  time, open: close, high: close, low: close, close, volume: 1_000_000,
});

describe("which holding period counts as best", () => {
  /*
    The trap this guards. Ranking on final value would pick the longest window
    on almost every stock ever tested, because it simply had more time to
    compound — "best" would silently mean "ten years" and tell a reader
    nothing about the stock.
  */
  it("prefers the higher annualised rate even when it ends with less money", () => {
    const shortButFast = { result: { cagr: 0.4, finalValue: 14_000 } };
    const longButSlow = { result: { cagr: 0.08, finalValue: 21_000 } };

    const best = bestByAnnualised([longButSlow, shortButFast] as never);
    expect(best).toBe(shortButFast);
    expect(best!.result.finalValue).toBeLessThan(longButSlow.result.finalValue);
  });

  it("ignores windows that failed to run at all", () => {
    const failed = { result: { error: "No price history" } };
    const worked = { result: { cagr: 0.1, finalValue: 11_000 } };

    expect(bestByAnnualised([failed, worked] as never)).toBe(worked);
  });

  it("ignores windows too short to annualise", () => {
    // A null CAGR is the simulator declining to annualise a stub of a period
    // rather than reporting zero. Treating null as 0 would rank a two-week
    // window above a genuinely negative ten-year one.
    const tooShort = { result: { cagr: null, finalValue: 10_050 } };
    const realButNegative = { result: { cagr: -0.05, finalValue: 7_000 } };

    expect(bestByAnnualised([tooShort, realButNegative] as never)).toBe(realButNegative);
  });

  it("returns null when nothing has a usable rate", () => {
    expect(bestByAnnualised([{ result: { error: "nope" } }] as never)).toBeNull();
    expect(bestByAnnualised([])).toBeNull();
  });
});

describe("the horizons themselves", () => {
  it("are ordered shortest to longest, which is how the table reads", () => {
    const years = HORIZONS.map((h) => h.years);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it("stay within the ten-year ceiling the price fetch is capped at", () => {
    // Asking for a longer horizon than getBarsWithSource will ever return
    // would produce a row that silently starts late on every symbol.
    for (const h of HORIZONS) expect(h.years).toBeLessThanOrEqual(10);
  });
});

describe("running several windows over one fetched series", () => {
  /*
    The sweep fetches once and simulates repeatedly, which is only safe
    because simulateInvestment locates its own starting bar inside whatever
    series it is handed. These check that premise directly rather than
    assuming it.
  */
  const bars = [
    bar(START, 100),
    bar(START + 365 * DAY, 150),
    bar(START + 730 * DAY, 200),
  ];

  it("gives a different answer per start date from the same series", () => {
    const fromStart = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);
    const fromMiddle = simulateInvestment(bars, [], new Date((START + 365 * DAY) * 1000), 1000, false);

    if (isInvestmentError(fromStart) || isInvestmentError(fromMiddle)) throw new Error("unexpected");

    // $1,000 at $100 doubles to $2,000 by $200; entering at $150 returns a
    // third less over half the time.
    expect(fromStart.finalValue).toBeCloseTo(2000, 6);
    expect(fromMiddle.finalValue).toBeCloseTo(1333.33, 1);
  });

  it("flags a window that starts before the data does", () => {
    // The 10-year row on a stock listed three years ago has to say so, or it
    // reads as a ten-year return that simply happens to be small.
    const older = simulateInvestment(bars, [], new Date((START - 900 * DAY) * 1000), 1000, false);
    if (isInvestmentError(older)) throw new Error("unexpected");

    expect(older.startedLate).toBe(true);
    expect(older.startTime).toBe(START);
  });
});
