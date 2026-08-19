import { describe, expect, it } from "vitest";
import { isInvestmentError, simulateInvestment } from "./single-stock";
import { tiingo } from "../providers/tiingo";
import { yahoo } from "../providers/yahoo";
import { twelveData } from "../providers/twelvedata";
import { finnhub } from "../providers/finnhub";
import type { Bar } from "../providers/types";

/**
 * Dividends must be counted exactly once.
 *
 * This is a regression test for a bug that shipped and looked fine. Failover
 * means a backtest's prices can arrive from any of four providers, and they do
 * not all adjust alike: Tiingo serves adjClose, a total-return series with
 * dividends already reinvested, while the others serve price series. Applying
 * the dividend feed on top of Tiingo's series counted every dividend twice.
 *
 * Nothing about the output looked wrong. SPY from 2020 reported +186% where
 * the true total return was near +159%, and because the benchmark was inflated
 * by the same mechanism, the comparison a reader actually relies on still
 * looked sane. The only visible symptom was that the same query answered
 * differently depending on which provider happened to be up.
 */

const DAY = 86_400;
const START = 1_700_000_000;

const bar = (time: number, close: number): Bar => ({
  time, open: close, high: close, low: close, close, volume: 1_000_000,
});

describe("each provider states how its closes are adjusted", () => {
  /*
    These flags are the whole fix. They are asserted rather than left implicit
    because the property they describe is invisible in the data — two series
    of plausible daily closes, one of which silently contains dividends.
  */
  it("marks Tiingo's series as already containing dividends", () => {
    expect(tiingo.barsIncludeDividends).toBe(true);
  });

  it("marks the price-series providers as not containing them", () => {
    expect(yahoo.barsIncludeDividends).toBe(false);
    expect(twelveData.barsIncludeDividends).toBe(false);
    expect(finnhub.barsIncludeDividends).toBe(false);
  });
});

describe("what double counting actually costs", () => {
  /*
    A worked example, so the size of the error is on the record rather than
    described. Ten shares bought at $100, a rise to $110, and one dividend of
    $5 a share along the way.
  */
  const bars = [bar(START, 100), bar(START + 100 * DAY, 105), bar(START + 200 * DAY, 110)];
  const dividends = [{ time: START + 100 * DAY, amount: 5 }];

  it("returns the series' own performance when no dividends are applied", () => {
    // What a total-return series must produce: $1,000 buys 10 shares at $100,
    // and 10 x $110 is $1,100. The dividend is already inside those prices.
    const result = simulateInvestment(bars, [], new Date(START * 1000), 1000, true);
    if (isInvestmentError(result)) throw new Error(result.error);

    expect(result.finalValue).toBeCloseTo(1100, 6);
    expect(result.totalReturn).toBeCloseTo(0.1, 6);
  });

  it("inflates the result when the dividend feed is applied on top", () => {
    // $5 on 10 shares is $50, buying 0.4762 more at that day's $105, and
    // 10.4762 x $110 is $1,152.38 — five points of return the adjusted series
    // had already counted.
    const result = simulateInvestment(bars, dividends, new Date(START * 1000), 1000, true);
    if (isInvestmentError(result)) throw new Error(result.error);

    expect(result.finalValue).toBeCloseTo(1152.38, 1);
    expect(result.totalReturn - 0.1).toBeGreaterThan(0.04);
  });

  /*
    The trap this test exists to guard.

    The first attempt at the fix turned reinvestment off for these series and
    left the dividend list in place, which looks equivalent and is not. An
    unreinvested dividend is not a discarded one — the simulator banks it as
    cash that still lands in the final value — so most of the double count
    survived a fix that appeared to address it.
  */
  it("still counts dividends when reinvestment is merely switched off", () => {
    const result = simulateInvestment(bars, dividends, new Date(START * 1000), 1000, false);
    if (isInvestmentError(result)) throw new Error(result.error);

    // $1,100 of shares plus $50 banked. Not $1,100 — turning reinvestment off
    // is not the same as excluding them, which is why the fix drops the list.
    expect(result.finalValue).toBeCloseTo(1150, 6);
    expect(result.finalValue).toBeGreaterThan(1100);
  });
});
