import { describe, expect, it } from "vitest";
import { isInvestmentError, simulateInvestment } from "./single-stock";
import type { Bar } from "../providers/types";

/**
 * "What if I had invested $X in this stock on this date?"
 *
 * Every number here is hand-checkable — the plan behind this feature said to
 * verify the return math against a known figure before building anything on
 * top of it, so the cases below are worked out by hand in each comment rather
 * than merely asserted against whatever the function happens to produce.
 */

const DAY = 86_400;
const YEAR = DAY * 365.25;
const START = 1_700_000_000; // an arbitrary anchor, only its spacing matters

const bar = (time: number, close: number): Bar => ({
  time, open: close, high: close, low: close, close, volume: 1_000_000,
});

describe("buying and holding, no dividends", () => {
  it("matches a hand-computed return and CAGR over exactly one year", () => {
    // $1,000 at $10/share buys 100 shares. One year later the price is $12:
    // 100 * $12 = $1,200, a flat +20%, and CAGR over exactly one year is the
    // same +20% — no compounding periods to complicate it.
    const bars = [bar(START, 10), bar(START + YEAR, 12)];
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.finalValue).toBeCloseTo(1200, 6);
    expect(result.totalReturn).toBeCloseTo(0.2, 6);
    expect(result.cagr).toBeCloseTo(0.2, 3);
  });

  it("reports a loss as a loss, not a clamped floor", () => {
    // $1,000 at $10/share, price falls to $6: 100 * $6 = $600, a -40% return.
    const bars = [bar(START, 10), bar(START + YEAR, 6)];
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.finalValue).toBeCloseTo(600, 6);
    expect(result.totalReturn).toBeCloseTo(-0.4, 6);
    expect(result.cagr).toBeCloseTo(-0.4, 3);
  });

  it("survives a price collapsing to zero without producing NaN or Infinity", () => {
    const bars = [bar(START, 10), bar(START + YEAR, 0.0001)];
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(Number.isFinite(result.finalValue)).toBe(true);
    expect(Number.isFinite(result.cagr)).toBe(true);
    expect(result.totalReturn).toBeLessThan(-0.99);
  });
});

describe("dividends", () => {
  // 100 shares, a $1/share dividend paid mid-window. Reinvested at the price
  // on the day it lands ($11): $100 of proceeds buys 100/11 more shares.
  const bars = [bar(START, 10), bar(START + YEAR / 2, 11), bar(START + YEAR, 12)];
  const dividend = [{ time: START + YEAR / 2, amount: 1 }];

  it("compounds a reinvested dividend into more shares", () => {
    const result = simulateInvestment(bars, dividend, new Date(START * 1000), 1000, true);
    if (isInvestmentError(result)) throw new Error(result.error);

    const expectedShares = 100 + 100 / 11;
    const midpoint = result.series.find((p) => p.time === START + YEAR / 2)!;
    expect(midpoint.shares).toBeCloseTo(expectedShares, 6);

    // Final value uses the compounded share count, not the original 100.
    expect(result.finalValue).toBeCloseTo(expectedShares * 12, 6);
    expect(result.dividendsReceived).toBe(0);
    expect(result.reinvested).toBe(true);
  });

  it("keeps the share count fixed and banks the dividend as cash when not reinvested", () => {
    const result = simulateInvestment(bars, dividend, new Date(START * 1000), 1000, false);
    if (isInvestmentError(result)) throw new Error(result.error);

    // 100 shares never changes; $1/share x 100 shares = $100 collected.
    expect(result.series.every((p) => p.shares === 100)).toBe(true);
    expect(result.dividendsReceived).toBeCloseTo(100, 6);

    // Share value alone (100 * $12 = $1,200) plus the $100 sitting in cash.
    expect(result.finalValue).toBeCloseTo(1300, 6);
  });

  it("excludes a dividend paid before the purchase or after the window ends", () => {
    const early = { time: START - DAY, amount: 5 };
    const late = { time: START + YEAR + DAY, amount: 5 };
    const result = simulateInvestment(bars, [early, late], new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.dividendsReceived).toBe(0);
  });

  it("combines two dividends landing on the same bar", () => {
    const two = [
      { time: START + YEAR / 2, amount: 1 },
      { time: START + YEAR / 2 + 60, amount: 0.5 }, // snaps to the same bar
    ];
    const result = simulateInvestment(bars, two, new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.dividendsReceived).toBeCloseTo(150, 6); // 100 shares * $1.50
  });
});

describe("start date handling", () => {
  const bars = [bar(START, 10), bar(START + DAY, 11), bar(START + 2 * DAY, 12)];

  it("uses the requested date exactly when a bar exists on it", () => {
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);
    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.startedLate).toBe(false);
    expect(result.startTime).toBe(START);
  });

  it("moves forward to the first available bar and says so, rather than failing", () => {
    const before = new Date((START - 10 * DAY) * 1000);
    const result = simulateInvestment(bars, [], before, 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.startedLate).toBe(true);
    expect(result.startTime).toBe(START);
  });

  it("reports an error rather than fabricating a result for a date after all data", () => {
    const after = new Date((START + 10 * DAY) * 1000);
    const result = simulateInvestment(bars, [], after, 1000, false);
    expect(isInvestmentError(result)).toBe(true);
  });
});

describe("input validation", () => {
  const bars = [bar(START, 10), bar(START + DAY, 11)];

  it("rejects an empty price history", () => {
    const result = simulateInvestment([], [], new Date(START * 1000), 1000, false);
    expect(isInvestmentError(result)).toBe(true);
  });

  it.each([0, -500, NaN, Infinity])("rejects a non-positive amount (%s)", (amount) => {
    const result = simulateInvestment(bars, [], new Date(START * 1000), amount, false);
    expect(isInvestmentError(result)).toBe(true);
  });
});

describe("CAGR", () => {
  it("is null for a window too short to annualise meaningfully", () => {
    const bars = [bar(START, 10), bar(START + 5 * DAY, 11)];
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.cagr).toBeNull();
    // Total return is still reported — the window is too short to annualise,
    // not too short to have happened.
    expect(result.totalReturn).toBeCloseTo(0.1, 6);
  });

  it("is a real number for a multi-year window, compounding correctly", () => {
    // Doubling over exactly two years is a CAGR of sqrt(2) - 1 ≈ 41.4%.
    const bars = [bar(START, 10), bar(START + 2 * YEAR, 20)];
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.cagr).toBeCloseTo(Math.sqrt(2) - 1, 3);
  });
});

describe("the series returned for charting", () => {
  it("has one point per bar in the window, in order", () => {
    const bars = [bar(START, 10), bar(START + DAY, 11), bar(START + 2 * DAY, 9)];
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.series.map((p) => p.time)).toEqual([START, START + DAY, START + 2 * DAY]);
  });

  it("omits bars before a late-shifted start", () => {
    const bars = [bar(START, 10), bar(START + DAY, 11), bar(START + 2 * DAY, 12)];
    const lateStart = new Date((START + DAY) * 1000);
    const result = simulateInvestment(bars, [], lateStart, 1000, false);

    if (isInvestmentError(result)) throw new Error(result.error);
    expect(result.series).toHaveLength(2);
    expect(result.series[0].time).toBe(START + DAY);
  });
});
