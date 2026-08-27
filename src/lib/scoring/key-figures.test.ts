import { describe, expect, it } from "vitest";
import { buildKeyFigures } from "./key-figures";
import type { NormalizedFundamentals } from "../fundamentals/types";

/**
 * The figures that were missing.
 *
 * The cases pinned here are the ones where the obvious implementation
 * produces a confident wrong number: a capex sign flip that turns the
 * heaviest spender into the biggest cash generator, and an interest-coverage
 * ratio that ranks a debt-free company beside one that cannot pay its
 * interest bill.
 */

function fact(value: number) {
  return { value, unit: "USD", end: "2025-12-31", form: "10-K", filed: "2026-02-01" };
}

function fundamentals(
  years: Record<string, number>[],
): NormalizedFundamentals {
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

const base = {
  revenue: 1_000,
  grossProfit: 400,
  operatingIncome: 200,
  netIncome: 100,
  equity: 500,
  assets: 2_000,
  operatingCashFlow: 300,
  capex: 120,
  sharesOutstanding: 50,
  cash: 200,
  longTermDebt: 300,
  shortTermDebt: 100,
  interestExpense: 25,
};

describe("free cash flow", () => {
  it("subtracts what was spent on plant from what operations produced", () => {
    const k = buildKeyFigures(fundamentals([base]), null);
    expect(k.freeCashFlow).toBe(180);
    expect(k.fcfMargin).toBeCloseTo(0.18, 5);
  });

  /*
    The sign trap. Capex is an outflow and most filers tag it positive, but a
    minority carry it negative — subtracting it as tagged would ADD to free
    cash flow for those, making the heaviest spenders look like the strongest
    cash generators.
  */
  it("treats a negatively tagged capex as spending, not income", () => {
    const k = buildKeyFigures(fundamentals([{ ...base, capex: -120 }]), null);
    expect(k.freeCashFlow).toBe(180);
    expect(k.freeCashFlow).not.toBe(420);
  });

  it("reports a company that outspends its cash flow as negative", () => {
    const k = buildKeyFigures(fundamentals([{ ...base, capex: 500 }]), null);
    expect(k.freeCashFlow).toBe(-200);
  });

  it("has no free cash flow figure when capex was never reported", () => {
    const noCapex = { ...base };
    delete (noCapex as Partial<typeof base>).capex;
    const k = buildKeyFigures(fundamentals([noCapex]), null);
    expect(k.freeCashFlow).toBeNull();
    expect(k.fcfMargin).toBeNull();
    expect(k.priceToFreeCashFlow).toBeNull();
  });
});

describe("margins and returns", () => {
  it("computes the three margins the page was only showing one of", () => {
    const k = buildKeyFigures(fundamentals([base]), null);
    expect(k.grossMargin).toBeCloseTo(0.4, 5);
    expect(k.operatingMargin).toBeCloseTo(0.2, 5);
    expect(k.netMargin).toBeCloseTo(0.1, 5);
  });

  it("computes return on equity alongside return on assets", () => {
    const k = buildKeyFigures(fundamentals([base]), null);
    expect(k.returnOnEquity).toBeCloseTo(0.2, 5);
    expect(k.returnOnAssets).toBeCloseTo(0.05, 5);
  });

  it("computes earnings per share", () => {
    expect(buildKeyFigures(fundamentals([base]), null).eps).toBeCloseTo(2, 5);
  });

  it("divides by nothing when a figure was never reported", () => {
    const k = buildKeyFigures(fundamentals([{ revenue: 1_000 }]), null);
    expect(k.grossMargin).toBeNull();
    expect(k.returnOnEquity).toBeNull();
    expect(k.eps).toBeNull();
  });

  it("does not divide by a zero denominator", () => {
    const k = buildKeyFigures(
      fundamentals([{ ...base, revenue: 0, equity: 0, sharesOutstanding: 0 }]),
      null,
    );
    expect(k.grossMargin).toBeNull();
    expect(k.returnOnEquity).toBeNull();
    expect(k.eps).toBeNull();
  });
});

describe("interest coverage", () => {
  it("measures operating profit against the interest bill", () => {
    expect(buildKeyFigures(fundamentals([base]), null).interestCoverage).toBeCloseTo(8, 5);
  });

  /*
    A company with no borrowings has no interest to cover. Reporting that as
    an enormous or infinite ratio would rank it beside a company that simply
    cannot pay — the honest answer is that the question does not apply.
  */
  it("has no ratio for a company with no interest to pay", () => {
    const k = buildKeyFigures(fundamentals([{ ...base, interestExpense: 0 }]), null);
    expect(k.interestCoverage).toBeNull();
    expect(Number.isFinite(k.interestCoverage ?? 0)).toBe(true);
  });

  it("reports a company that cannot cover its interest as below one", () => {
    const k = buildKeyFigures(
      fundamentals([{ ...base, operatingIncome: 10, interestExpense: 40 }]),
      null,
    );
    expect(k.interestCoverage).toBeCloseTo(0.25, 5);
  });
});

describe("share count", () => {
  /*
    Buybacks return cash as surely as a dividend, and quiet issuance dilutes
    the holders already there — neither was visible anywhere on the page.
  */
  it("reads a falling share count as a buyback", () => {
    const k = buildKeyFigures(
      fundamentals([base, { ...base, sharesOutstanding: 55 }]),
      null,
    );
    expect(k.shareCountChange).toBeCloseTo(-0.0909, 3);
  });

  it("reads a rising share count as dilution", () => {
    const k = buildKeyFigures(
      fundamentals([base, { ...base, sharesOutstanding: 40 }]),
      null,
    );
    expect(k.shareCountChange).toBeCloseTo(0.25, 5);
  });

  it("has no change to report without a prior year", () => {
    expect(buildKeyFigures(fundamentals([base]), null).shareCountChange).toBeNull();
  });
});

describe("price to free cash flow", () => {
  /*
    Net cash per share is deliberately not offered, and this pins that.

    `cash` maps only to cash and equivalents, not to the marketable
    securities a cash-rich company actually keeps its money in — for Apple it
    reported net debt against a real net cash position of about $20bn.
  */
  it("does not offer a net cash figure the cash field cannot support", () => {
    const k = buildKeyFigures(fundamentals([base]), null);
    expect("netCashPerShare" in k).toBe(false);
  });

  it("prices the company against the cash it actually generates", () => {
    // Market cap 3,600 over 180 of free cash flow.
    expect(buildKeyFigures(fundamentals([base]), 3_600).priceToFreeCashFlow).toBeCloseTo(20, 5);
  });

  /*
    A negative denominator would produce a negative multiple that sorts as
    though it were cheap, when it means the company is burning cash.
  */
  it("refuses a multiple against negative free cash flow", () => {
    const k = buildKeyFigures(fundamentals([{ ...base, capex: 500 }]), 3_600);
    expect(k.freeCashFlow).toBeLessThan(0);
    expect(k.priceToFreeCashFlow).toBeNull();
  });

  it("has no multiple without a market value", () => {
    expect(buildKeyFigures(fundamentals([base]), null).priceToFreeCashFlow).toBeNull();
  });
});
