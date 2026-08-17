import { describe, expect, it } from "vitest";
import { buildPointInTimeFundamentals, type FinancialsRow } from "./point-in-time";
import { fieldValue } from "../fundamentals/normalize";

/**
 * Reconstructing what a company's fundamentals looked like on a given date.
 *
 * This is the correctness-critical piece of the whole backtest: get it wrong
 * and a strategy quietly scores 2020 with information that only existed in
 * 2022, which inflates every result built on top of it without anything
 * looking wrong on the surface.
 */

const row = (over: Partial<FinancialsRow>): FinancialsRow => ({
  id: 1,
  companyId: 1,
  fiscalYear: 2022,
  endDate: "2022-12-31",
  form: "10-K",
  currency: "USD",
  filedAt: "2023-02-15",
  assets: 1000,
  liabilities: 400,
  equity: 600,
  currentAssets: null,
  currentLiabilities: null,
  cash: null,
  receivables: null,
  inventory: null,
  ppe: null,
  longTermDebt: null,
  shortTermDebt: null,
  retainedEarnings: null,
  revenue: 800,
  costOfRevenue: null,
  grossProfit: null,
  operatingIncome: null,
  netIncome: 100,
  incomeBeforeTax: null,
  interestExpense: null,
  sga: null,
  depreciation: null,
  operatingCashFlow: null,
  capex: null,
  dividendsPaid: null,
  sharesOutstanding: null,
  sourceFilingUrl: null,
  createdAt: new Date("2023-02-15"),
  ...over,
});

describe("reconstructing point-in-time fundamentals", () => {
  it("includes a period once its filing date has passed", () => {
    const result = buildPointInTimeFundamentals(
      [row({ fiscalYear: 2022, filedAt: "2023-02-15" })],
      "1",
      "Test Co",
      new Date("2023-03-01"),
    );

    expect(result).not.toBeNull();
    expect(result!.annual).toHaveLength(1);
    expect(fieldValue(result!.annual[0], "revenue")).toBe(800);
  });

  it("excludes a period whose filing date has not happened yet as of the backtest date", () => {
    // The exact failure mode this feature exists to prevent: scoring FY2022
    // with results that were not public until three months later.
    const result = buildPointInTimeFundamentals(
      [row({ fiscalYear: 2022, filedAt: "2023-02-15" })],
      "1",
      "Test Co",
      new Date("2023-01-01"),
    );

    expect(result).toBeNull();
  });

  it("excludes a row with no filed date rather than treating it as always known", () => {
    // A period ingested before the Phase 0 backfill, or sourced from a
    // fallback provider that never carries a filing date.
    const result = buildPointInTimeFundamentals(
      [row({ fiscalYear: 2022, filedAt: null })],
      "1",
      "Test Co",
      new Date("2099-01-01"), // even far in the future, it should not qualify
    );

    expect(result).toBeNull();
  });

  it("reveals more history as the backtest date advances", () => {
    const rows = [
      row({ fiscalYear: 2020, endDate: "2020-12-31", filedAt: "2021-02-10", revenue: 500 }),
      row({ fiscalYear: 2021, endDate: "2021-12-31", filedAt: "2022-02-12", revenue: 650 }),
      row({ fiscalYear: 2022, endDate: "2022-12-31", filedAt: "2023-02-15", revenue: 800 }),
    ];

    const early = buildPointInTimeFundamentals(rows, "1", "Test Co", new Date("2021-06-01"));
    expect(early!.annual.map((p) => p.fiscalYear)).toEqual([2020]);

    const mid = buildPointInTimeFundamentals(rows, "1", "Test Co", new Date("2022-06-01"));
    expect(mid!.annual.map((p) => p.fiscalYear)).toEqual([2021, 2020]);

    const late = buildPointInTimeFundamentals(rows, "1", "Test Co", new Date("2024-01-01"));
    expect(late!.annual.map((p) => p.fiscalYear)).toEqual([2022, 2021, 2020]);
  });

  it("sorts newest-first regardless of the input order", () => {
    const rows = [
      row({ fiscalYear: 2020, filedAt: "2021-02-10" }),
      row({ fiscalYear: 2022, filedAt: "2023-02-15" }),
      row({ fiscalYear: 2021, filedAt: "2022-02-12" }),
    ];

    const result = buildPointInTimeFundamentals(rows, "1", "Test Co", new Date("2024-01-01"));
    expect(result!.annual.map((p) => p.fiscalYear)).toEqual([2022, 2021, 2020]);
  });

  it("omits a null column rather than fabricating a zero", () => {
    const result = buildPointInTimeFundamentals(
      [row({ cash: null })],
      "1",
      "Test Co",
      new Date("2024-01-01"),
    );

    expect(result!.annual[0].facts.cash).toBeUndefined();
    expect(fieldValue(result!.annual[0], "cash")).toBeNull();
  });

  it("carries the row's own currency onto every fact", () => {
    const result = buildPointInTimeFundamentals(
      [row({ currency: "CAD" })],
      "1",
      "Test Co",
      new Date("2024-01-01"),
    );

    expect(result!.annual[0].facts.assets!.unit).toBe("CAD");
    expect(result!.annual[0].facts.revenue!.unit).toBe("CAD");
  });

  it("carries the period's own filedAt through for downstream use", () => {
    const result = buildPointInTimeFundamentals(
      [row({ filedAt: "2023-02-15" })],
      "1",
      "Test Co",
      new Date("2024-01-01"),
    );

    expect(result!.annual[0].filedAt).toBe("2023-02-15");
  });

  it("returns null for an empty row set", () => {
    expect(buildPointInTimeFundamentals([], "1", "Test Co", new Date())).toBeNull();
  });
});
