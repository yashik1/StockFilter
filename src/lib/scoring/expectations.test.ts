import { describe, expect, it } from "vitest";
import { buildImpliedExpectations } from "./expectations";
import type { NormalizedFundamentals } from "../fundamentals/types";

/**
 * The growth rate the price implies.
 *
 * Two kinds of case matter here. The first is arithmetic: the solver is the
 * only place in this app that inverts a model rather than evaluating one, so
 * it is anchored against a discounted cash flow worked out by hand below.
 *
 * The second, and the larger half of this file, is every case where the
 * function must produce *nothing*. A reader shown "the price assumes 340% a
 * year" or a growth rate computed from a company that burns cash would take
 * the number at face value, and it would be meaningless. Refusing is the
 * feature; these tests exist to keep it refusing.
 */

function fact(value: number) {
  return { value, unit: "USD", end: "2025-12-31", form: "10-K", filed: "2026-02-01" };
}

function fundamentals(years: Record<string, number>[]): NormalizedFundamentals {
  return {
    cik: "0000000001",
    entityName: "Test Co",
    taxonomy: "us-gaap",
    annual: years.map((y, i) => ({
      fiscalYear: 2025 - i,
      end: `${2025 - i}-12-31`,
      form: "10-K",
      facts: Object.fromEntries(Object.entries(y).map(([k, v]) => [k, fact(v)])),
    })),
  } as unknown as NormalizedFundamentals;
}

/** Free cash flow of 100, no debt and no cash, so enterprise value is the market cap. */
const year = (freeCashFlow: number) => ({
  operatingCashFlow: freeCashFlow + 120,
  capex: 120,
  longTermDebt: 0,
  shortTermDebt: 0,
  cash: 0,
});

/** Three flat years at 100 of free cash flow — the simplest possible company. */
const flat = fundamentals([year(100), year(100), year(100)]);

/*
  Worked by hand, and the anchor for everything else.

  Free cash flow of 100, discounted at 9%, growing at 0% for ten years and at
  2.5% forever after:

    ten years   100 x (1 - 1.09^-10) / 0.09          =   641.77
    terminal    (100 x 1.025 / 0.065) / 1.09^10      =   666.11
                                                       --------
                                                        1307.88

  So a company generating 100 and priced at 1307.88 is priced for no growth at
  all. Any implementation that disagrees with this line is wrong.
*/
const PRICED_FOR_NO_GROWTH = 1307.875;

describe("solving for the growth the price implies", () => {
  it("matches a discounted cash flow worked out by hand", () => {
    const e = buildImpliedExpectations(flat, "other", PRICED_FOR_NO_GROWTH);

    expect(e).not.toBeNull();
    expect(e!.impliedGrowth).toBeCloseTo(0, 4);
  });

  it("demands more growth of a dearer price", () => {
    const cheap = buildImpliedExpectations(flat, "other", 1_000)!;
    const dear = buildImpliedExpectations(flat, "other", 3_000)!;

    expect(cheap.impliedGrowth).toBeLessThan(0);
    expect(dear.impliedGrowth).toBeGreaterThan(cheap.impliedGrowth);
  });

  /*
    The band is the point. A single number would read as a measurement, and the
    discount rate it rests on is a choice rather than a fact — so the low and
    high ends have to bracket the headline figure, and a harder discount rate
    has to demand more growth to justify the same price, not less.
  */
  it("brackets the headline figure between the two discount rates", () => {
    const e = buildImpliedExpectations(flat, "other", 2_000)!;

    expect(e.growthLow).toBeLessThan(e.impliedGrowth);
    expect(e.impliedGrowth).toBeLessThan(e.growthHigh);
    expect(e.discountLow).toBeLessThan(e.discountHigh);
  });

  it("carries the assumptions it used, so the page can state them", () => {
    const e = buildImpliedExpectations(flat, "other", 2_000)!;

    expect(e.terminalGrowth).toBeGreaterThan(0);
    expect(e.terminalGrowth).toBeLessThan(e.discountLow);
    expect(e.horizonYears).toBeGreaterThan(0);
    expect(e.baseFreeCashFlow).toBe(100);
    expect(e.fiscalYear).toBe(2025);
  });

  it("adds net debt to the price to get what the business costs", () => {
    const geared = fundamentals([
      { ...year(100), longTermDebt: 500, cash: 100 },
      year(100),
      year(100),
    ]);

    const e = buildImpliedExpectations(geared, "other", 1_000)!;
    expect(e.enterpriseValue).toBe(1_400);
  });

  it("never returns a figure that is not a number", () => {
    for (const cap of [1_000, 1_500, 2_500, 4_000]) {
      const e = buildImpliedExpectations(flat, "other", cap);
      if (!e) continue;
      for (const v of [e.impliedGrowth, e.growthLow, e.growthHigh, e.enterpriseValue]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("when it must refuse", () => {
  /*
    The one that matters most. Every growth rate applied to a negative base
    gives a more negative number, so there is no rate at which the model
    reaches the price — the solver has no root, and the concept has no meaning.
  */
  it("says nothing about a company that burns cash", () => {
    const burning = fundamentals([year(-50), year(100), year(100)]);
    expect(buildImpliedExpectations(burning, "other", 2_000)).toBeNull();
  });

  it("says nothing when free cash flow is exactly zero", () => {
    const breakeven = fundamentals([year(0), year(100), year(100)]);
    expect(buildImpliedExpectations(breakeven, "other", 2_000)).toBeNull();
  });

  it("says nothing about a company with too short a record", () => {
    expect(buildImpliedExpectations(fundamentals([year(100)]), "other", 2_000)).toBeNull();
    expect(
      buildImpliedExpectations(fundamentals([year(100), year(100)]), "other", 2_000),
    ).toBeNull();
  });

  it("says nothing without a market capitalisation to invert", () => {
    for (const cap of [null, 0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildImpliedExpectations(flat, "other", cap)).toBeNull();
    }
  });

  /*
    Enterprise value subtracts cash and adds debt because both are taken to be
    incidental to the operating business. For a bank they ARE the operating
    business, so the figure answers a different question — the same reason
    Altman's Z-Score is suppressed for financials rather than shown with a
    caveat.
  */
  it("says nothing about a bank", () => {
    expect(buildImpliedExpectations(flat, "financial", 2_000)).toBeNull();
  });

  /*
    Both bracket edges. A price implying less than -20% or more than 60% a year
    usually means the model does not fit the company at all — a turnaround, a
    peak-cycle year — and "at least 60%" would present that mismatch as a
    finding.
  */
  it("says nothing when the answer runs off either end of the bracket", () => {
    expect(buildImpliedExpectations(flat, "other", 200)).toBeNull();
    expect(buildImpliedExpectations(flat, "other", 500_000)).toBeNull();
  });

  it("says nothing when net cash exceeds what the market pays for the whole company", () => {
    const cashPile = fundamentals([{ ...year(100), cash: 5_000 }, year(100), year(100)]);
    expect(buildImpliedExpectations(cashPile, "other", 1_000)).toBeNull();
  });

  /*
    The Amazon case, and the sharpest weakness of the method.

    FY2025 left Amazon with $7.7bn of free cash flow against $2.7tn of
    enterprise value, because record datacentre spending had temporarily
    swallowed it. The model reported that the price assumed 46% a year: true,
    and a fact about one year of capex rather than about the price. A reader
    able to see that does not need the panel; the reader this app is for would
    take 46% as a verdict.
  */
  it("says nothing when a heavy investment year has flattened the base", () => {
    const investing = fundamentals([year(8), year(38), year(32), year(30), year(28)]);
    expect(buildImpliedExpectations(investing, "other", 2_000)).toBeNull();
  });

  /*
    Amazon's actual shape, and the reason the norm counts only the years that
    produced cash. Its FY2021 and FY2022 were both negative; leaving them in
    the median pulled the norm down to a level the collapsed FY2025 base
    cleared, and the panel reported 46% anyway.
  */
  it("is not fooled by loss years sitting either side of the norm", () => {
    const amazonShaped = fundamentals([year(7.7), year(38), year(32), year(-17), year(-15)]);
    expect(buildImpliedExpectations(amazonShaped, "other", 2_000)).toBeNull();
  });

  it("still answers when the latest year is merely down, not collapsed", () => {
    const dip = fundamentals([year(80), year(100), year(100), year(95), year(90)]);
    expect(buildImpliedExpectations(dip, "other", 2_000)).not.toBeNull();
  });

  /*
    The gate is one-sided on purpose. A base far above the recent norm is what
    genuine growth looks like, and suppressing it would discard the real cases
    along with the flukes.
  */
  it("does not refuse a company whose cash flow has jumped", () => {
    const surging = fundamentals([year(300), year(120), year(100), year(90), year(80)]);
    expect(buildImpliedExpectations(surging, "other", 8_000)).not.toBeNull();
  });

  it("has no norm to judge against when the earlier years were negative", () => {
    const earlyLosses = fundamentals([year(50), year(-20), year(-40)]);
    expect(buildImpliedExpectations(earlyLosses, "other", 1_000)).not.toBeNull();
  });

  it("says nothing when capex was never reported, so free cash flow does not exist", () => {
    const noCapex = fundamentals([
      { operatingCashFlow: 220, cash: 0 },
      { operatingCashFlow: 220, cash: 0 },
      { operatingCashFlow: 220, cash: 0 },
    ]);
    expect(buildImpliedExpectations(noCapex, "other", 2_000)).toBeNull();
  });
});

describe("what the company actually did", () => {
  it("annualises the change in free cash flow", () => {
    // 100 to 121 across two years is 10% a year.
    const growing = fundamentals([year(121), year(110), year(100)]);
    const e = buildImpliedExpectations(growing, "other", 2_000)!;

    expect(e.actualGrowth).toBeCloseTo(0.1, 6);
    expect(e.actualYears).toBe(2);
  });

  it("measures over the longest run of positive years available", () => {
    const long = fundamentals([year(200), year(180), year(160), year(140), year(100)]);
    const e = buildImpliedExpectations(long, "other", 3_000)!;

    // Doubling across four years: 2^(1/4) - 1, or about 18.9% a year.
    expect(e.actualYears).toBe(4);
    expect(e.actualGrowth).toBeCloseTo(2 ** 0.25 - 1, 6);
  });

  /*
    Growth from a negative base is arithmetically defined and completely
    meaningless — a company going from -50 to 100 has not grown by any
    percentage. This is the figure a reader compares the implied rate against,
    so a wrong one here is worse than none.
  */
  it("reports no historical growth when the earliest year was negative", () => {
    const turnaround = fundamentals([year(100), year(50), year(-50)]);
    const e = buildImpliedExpectations(turnaround, "other", 2_000)!;

    expect(e.actualGrowth).toBeNull();
    expect(e.actualYears).toBe(0);
  });

  it("still reports the implied rate when the history is unusable", () => {
    const turnaround = fundamentals([year(100), year(50), year(-50)]);
    const e = buildImpliedExpectations(turnaround, "other", 2_000)!;

    expect(e.impliedGrowth).not.toBeNull();
    expect(Number.isFinite(e.impliedGrowth)).toBe(true);
  });
});
