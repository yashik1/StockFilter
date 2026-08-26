import { describe, expect, it } from "vitest";
import { __testing } from "./ingest";

const { priceDerived } = __testing;

/**
 * The figures a share price implies.
 *
 * These were null for every one of the 542 companies on the live deployment
 * while the dashboard showed current prices for the same symbols, so the
 * screener printed a column of dashes. Recomputing them on each quote refresh
 * is what repairs that, and the cases below are the ones where the obvious
 * implementation does the wrong thing.
 */

const latest = (over: Record<string, number | null> = {}) => ({
  shares_outstanding: 1_000,
  net_income: 500,
  equity: 2_000,
  revenue: 4_000,
  dividends_paid: 100,
  ...over,
});

describe("recomputing from a fresh price", () => {
  it("derives market value and every ratio built on it", () => {
    const out = priceDerived(10, latest());

    expect(out.marketCap).toBe(10_000);
    expect(out.peRatio).toBeCloseTo(20, 5);
    expect(out.pbRatio).toBeCloseTo(5, 5);
    expect(out.psRatio).toBeCloseTo(2.5, 5);
    expect(out.dividendYield).toBeCloseTo(0.01, 5);
  });

  it("tracks the price, which is the point of recomputing at all", () => {
    expect(priceDerived(10, latest()).marketCap).toBe(10_000);
    expect(priceDerived(25, latest()).marketCap).toBe(25_000);
  });

  /*
    The rule that keeps this safe to run every few minutes. The result is
    spread over the existing row, so an empty object leaves whatever is stored
    untouched. Returning nulls instead would wipe out a good market cap — one
    Finnhub reported directly, say — the first time a filer failed to tag its
    share count.
  */
  it("changes nothing when the share count is unknown", () => {
    expect(priceDerived(10, latest({ shares_outstanding: null }))).toEqual({});
    expect(priceDerived(10, latest({ shares_outstanding: 0 }))).toEqual({});
    expect(priceDerived(10, undefined)).toEqual({});
  });

  /*
    A loss makes a P/E meaningless rather than negative. A negative P/E sorts
    to the top of "lowest P/E" and reads as the cheapest company on the
    screen, which is the exact opposite of what it means.
  */
  it("refuses a P/E against a loss", () => {
    expect(priceDerived(10, latest({ net_income: -500 })).peRatio).toBeNull();
    expect(priceDerived(10, latest({ net_income: 0 })).peRatio).toBeNull();
  });

  it("still reports the other ratios when earnings are negative", () => {
    const out = priceDerived(10, latest({ net_income: -500 }));
    expect(out.marketCap).toBe(10_000);
    expect(out.pbRatio).toBeCloseTo(5, 5);
    expect(out.psRatio).toBeCloseTo(2.5, 5);
  });

  it("divides by nothing when a figure was never reported", () => {
    const out = priceDerived(10, latest({ equity: null, revenue: null, net_income: null }));
    expect(out.pbRatio).toBeNull();
    expect(out.psRatio).toBeNull();
    expect(out.peRatio).toBeNull();
    expect(out.marketCap).toBe(10_000);
  });

  it("does not divide by a zero denominator", () => {
    const out = priceDerived(10, latest({ equity: 0, revenue: 0 }));
    expect(out.pbRatio).toBeNull();
    expect(out.psRatio).toBeNull();
  });

  /*
    Dividends are a cash outflow and filers disagree about the sign. Taken as
    tagged, a negatively-tagged filer would report a negative yield — an
    income screen would then rank the payers last.
  */
  it("reads a negatively-tagged dividend as a payment", () => {
    expect(priceDerived(10, latest({ dividends_paid: -100 })).dividendYield).toBeCloseTo(0.01, 5);
  });

  it("leaves the yield null for a company that pays nothing", () => {
    expect(priceDerived(10, latest({ dividends_paid: null })).dividendYield).toBeNull();
  });
});
