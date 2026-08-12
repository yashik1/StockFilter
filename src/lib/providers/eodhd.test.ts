import { describe, expect, it } from "vitest";
import { buildHealthReport } from "../scoring/health";
import { mapEodhdFundamentals, resample, type EodhdFundamentals } from "./eodhd";
import type { Bar } from "./types";

/**
 * The EODHD adapter is dormant until a key is supplied, so these tests cover
 * the parts that do not need one: that its payload maps onto exactly the same
 * canonical model the SEC normalizer produces, and therefore scores identically.
 */
const sample: EodhdFundamentals = {
  General: { Name: "Test Corp", CIK: "0001234567", CountryISO: "GB" },
  Highlights: { MarketCapitalization: 5e9 },
  SharesStats: { SharesOutstanding: 1e8 },
  Financials: {
    Balance_Sheet: {
      yearly: {
        "2024-12-31": {
          totalAssets: "1000", totalLiab: "400", totalStockholderEquity: "600",
          totalCurrentAssets: "500", totalCurrentLiabilities: "200",
          cash: "150", netReceivables: "80", inventory: "60",
          propertyPlantEquipment: "300", longTermDebt: "250",
          shortTermDebt: "50", retainedEarnings: "350",
        },
        "2023-12-31": {
          totalAssets: "900", totalStockholderEquity: "500",
          totalCurrentAssets: "450", totalCurrentLiabilities: "220",
          cash: "120", netReceivables: "70", inventory: "55",
          propertyPlantEquipment: "280", longTermDebt: "260",
          shortTermDebt: "40", retainedEarnings: "300",
        },
      },
    },
    Income_Statement: {
      yearly: {
        "2024-12-31": {
          totalRevenue: "800", costOfRevenue: "500", grossProfit: "300",
          operatingIncome: "150", netIncome: "100", incomeBeforeTax: "130",
          interestExpense: "20", sellingGeneralAdministrative: "90",
          depreciationAndAmortization: "40",
        },
        "2023-12-31": {
          totalRevenue: "700", costOfRevenue: "450", grossProfit: "250",
          operatingIncome: "120", netIncome: "80", incomeBeforeTax: "105",
          interestExpense: "22", sellingGeneralAdministrative: "85",
          depreciationAndAmortization: "38",
        },
      },
    },
    Cash_Flow: {
      yearly: {
        "2024-12-31": { totalCashFromOperatingActivities: "180", capitalExpenditures: "-60" },
        "2023-12-31": { totalCashFromOperatingActivities: "150", capitalExpenditures: "-55" },
      },
    },
  },
};

describe("EODHD fundamentals mapping", () => {
  const mapped = mapEodhdFundamentals(sample, "TEST.L");

  it("maps statements onto the canonical schema", () => {
    expect(mapped.entityName).toBe("Test Corp");
    expect(mapped.annual).toHaveLength(2);

    const latest = mapped.annual[0];
    expect(latest.fiscalYear).toBe(2024);
    expect(latest.facts.assets?.value).toBe(1000);
    expect(latest.facts.revenue?.value).toBe(800);
    expect(latest.facts.operatingCashFlow?.value).toBe(180);
    expect(latest.facts.shortTermDebt?.value).toBe(50);
  });

  it("sorts periods newest first", () => {
    expect(mapped.annual.map((p) => p.fiscalYear)).toEqual([2024, 2023]);
  });

  it("coerces string values to numbers", () => {
    expect(typeof mapped.annual[0].facts.assets?.value).toBe("number");
  });

  // The same derivation the SEC path applies, so both providers behave alike.
  it("derives liabilities when absent", () => {
    const y2023 = mapped.annual[1];
    expect(y2023.facts.liabilities?.derived).toBe(true);
    expect(y2023.facts.liabilities?.value).toBe(400); // 900 - 500
  });

  it("does not mark reported liabilities as derived", () => {
    expect(mapped.annual[0].facts.liabilities?.derived).toBeUndefined();
    expect(mapped.annual[0].facts.liabilities?.value).toBe(400);
  });

  // The whole point of the abstraction: scoring cannot tell the difference.
  it("produces a scoreable report identical in shape to the SEC path", () => {
    const report = buildHealthReport(mapped, "other", 5e9);
    expect(report.questions).toHaveLength(5);
    expect(report.score).not.toBeNull();
    expect(report.piotroski.maxScore).toBeGreaterThan(0);
    expect(report.altman.applicable).toBe(true);
  });

  it("handles an empty payload without throwing", () => {
    const empty = mapEodhdFundamentals({}, "NONE");
    expect(empty.annual).toHaveLength(0);
    expect(empty.missingFields.length).toBeGreaterThan(0);
  });
});

describe("bar resampling", () => {
  const mk = (time: number, o: number, h: number, l: number, c: number, v: number): Bar => ({
    time, open: o, high: h, low: l, close: c, volume: v,
  });

  it("aggregates 5-minute bars into 15-minute buckets", () => {
    const bars = [
      mk(0, 10, 12, 9, 11, 100),
      mk(300, 11, 15, 10, 14, 200),
      mk(600, 14, 16, 13, 15, 150),
      mk(900, 15, 17, 14, 16, 300),
    ];
    const out = resample(bars, 900);

    expect(out).toHaveLength(2);
    // First bucket keeps the first open, last close, extreme high/low, summed volume.
    expect(out[0]).toMatchObject({ time: 0, open: 10, high: 16, low: 9, close: 15, volume: 450 });
    expect(out[1]).toMatchObject({ time: 900, open: 15, close: 16, volume: 300 });
  });

  it("returns an empty array for no input", () => {
    expect(resample([], 900)).toEqual([]);
  });
});
