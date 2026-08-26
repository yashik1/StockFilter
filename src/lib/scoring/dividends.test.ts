import { describe, expect, it } from "vitest";
import { buildDividendReport } from "./dividends";
import type { NormalizedFundamentals } from "../fundamentals/types";

/**
 * The dividend panel's arithmetic.
 *
 * The cases worth pinning are the ones where the obvious implementation is
 * wrong: a payout ratio against a loss is meaningless rather than negative or
 * infinite, a REIT above 100% is normal rather than alarming, and a filer who
 * tags dividends as a negative outflow must not read as a company being paid
 * by its own shareholders.
 */

/** Builds a fundamentals object holding only the fields these tests read. */
function fundamentals(
  years: {
    year: number;
    dividendsPaid?: number | null;
    netIncome?: number | null;
    operatingCashFlow?: number | null;
  }[],
): NormalizedFundamentals {
  return {
    cik: "0000000001",
    entityName: "Test Co",
    taxonomy: "us-gaap",
    annual: years.map((y) => ({
      fiscalYear: y.year,
      end: `${y.year}-12-31`,
      form: "10-K",
      facts: {
        ...(y.dividendsPaid !== undefined && y.dividendsPaid !== null
          ? { dividendsPaid: fact(y.dividendsPaid) }
          : {}),
        ...(y.netIncome !== undefined && y.netIncome !== null
          ? { netIncome: fact(y.netIncome) }
          : {}),
        ...(y.operatingCashFlow !== undefined && y.operatingCashFlow !== null
          ? { operatingCashFlow: fact(y.operatingCashFlow) }
          : {}),
      },
    })),
  } as unknown as NormalizedFundamentals;
}

/**
 * SIC codes, not sector kinds.
 *
 * 6798 is the REIT classification. It is worth writing out here because
 * sectorFromSic maps it to "financial" rather than "real-estate" — the trap
 * that let a REIT be told it paid out more than it earned.
 */
const REIT = 6798;
const MANUFACTURER = 3711;

function fact(value: number) {
  return { value, unit: "USD", end: "2025-12-31", form: "10-K", filed: "2026-02-01" };
}

describe("does it pay, and can it afford to", () => {
  it("reports a well-covered dividend as good", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: 15_000, netIncome: 50_000, operatingCashFlow: 60_000 },
      ]),
      MANUFACTURER,
    );

    expect(report.paysDividend).toBe(true);
    expect(report.payoutRatio).toBeCloseTo(0.3, 5);
    expect(report.cashCoverage).toBeCloseTo(0.25, 5);
    expect(report.rating).toBe("good");
    expect(report.answer).toContain("30 cents");
  });

  it("treats a payer that keeps almost nothing back as only fair", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: 90_000, netIncome: 100_000, operatingCashFlow: 120_000 },
      ]),
      MANUFACTURER,
    );

    expect(report.payoutRatio).toBeCloseTo(0.9, 5);
    expect(report.rating).toBe("fair");
  });

  it("flags paying out more than was earned", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: 130_000, netIncome: 100_000, operatingCashFlow: 90_000 },
      ]),
      MANUFACTURER,
    );

    expect(report.rating).toBe("poor");
    expect(report.answer).toContain("more than it earned");
  });

  /*
    The trap. Dividing by a loss gives a negative ratio that sorts and reads
    as if it were a small, healthy payout — the worst possible failure mode
    for a figure whose whole job is to say whether a payment is affordable.
  */
  it("refuses to compute a payout ratio against a loss, and says why", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: 20_000, netIncome: -40_000, operatingCashFlow: 5_000 },
      ]),
      MANUFACTURER,
    );

    expect(report.payoutRatio).toBeNull();
    expect(report.rating).toBe("poor");
    expect(report.answer).toContain("while making a loss");
  });

  it("does not divide by a zero profit", () => {
    const report = buildDividendReport(
      fundamentals([{ year: 2025, dividendsPaid: 10_000, netIncome: 0 }]),
      MANUFACTURER,
    );

    expect(report.payoutRatio).toBeNull();
    expect(Number.isFinite(report.payoutRatio ?? 0)).toBe(true);
  });

  /*
    A REIT reports profit after depreciating buildings that are not wearing
    out at that rate, and must distribute most of its taxable income to keep
    its tax status. Judged by the general rule, almost every REIT in the
    universe would be marked as paying more than it can afford.
  */
  it("does not treat a REIT above 100% of profit as a warning", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: 140_000, netIncome: 100_000, operatingCashFlow: 200_000 },
      ]),
      REIT,
    );

    expect(report.rating).toBe("good");
    expect(report.answer).toContain("normal here");
    expect(report.answer).not.toContain("more than it earned");
  });

  /*
    The regression. This is the case the unit tests originally "covered" and
    the live page still got wrong, because the test handed the module a
    sector kind while the page handed it a REIT that sectorFromSic classifies
    as "financial". Pinned on the SIC code itself, which is what the page
    actually has.
  */
  it("recognises a REIT by the code it files under, not by its sector kind", () => {
    const realtyIncomeShaped = fundamentals([
      { year: 2025, dividendsPaid: 2_760, netIncome: 1_000, operatingCashFlow: 3_780 },
    ]);

    const asTrust = buildDividendReport(realtyIncomeShaped, 6798);
    expect(asTrust.answer).toContain("normal here");
    expect(asTrust.answer).not.toContain("more than it earned");
    expect(asTrust.rating).not.toBe("poor");

    // The same numbers from an ordinary company are a genuine warning.
    const asCompany = buildDividendReport(realtyIncomeShaped, MANUFACTURER);
    expect(asCompany.answer).toContain("more than it earned");
    expect(asCompany.rating).toBe("poor");
  });

  it("accepts a SIC code as the string the filings carry", () => {
    const report = buildDividendReport(
      fundamentals([{ year: 2025, dividendsPaid: 140, netIncome: 100, operatingCashFlow: 200 }]),
      "6798",
    );
    expect(report.answer).toContain("normal here");
  });

  it("reads a negatively-tagged outflow as a payment, not a receipt", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: -15_000, netIncome: 50_000, operatingCashFlow: 60_000 },
      ]),
      MANUFACTURER,
    );

    expect(report.paysDividend).toBe(true);
    expect(report.paid).toBe(15_000);
    expect(report.payoutRatio).toBeCloseTo(0.3, 5);
  });

  it("says plainly when a company pays nothing, without marking it down", () => {
    const report = buildDividendReport(
      fundamentals([{ year: 2025, netIncome: 500_000, operatingCashFlow: 600_000 }]),
      MANUFACTURER,
    );

    expect(report.paysDividend).toBe(false);
    expect(report.rating).toBe("unknown");
    expect(report.answer).toContain("reinvests them");
    expect(report.payoutRatio).toBeNull();
  });
});

describe("the streak", () => {
  it("counts consecutive years back from the latest filing", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: 30, netIncome: 100 },
        { year: 2024, dividendsPaid: 28, netIncome: 100 },
        { year: 2023, dividendsPaid: 25, netIncome: 100 },
      ]),
      MANUFACTURER,
    );

    expect(report.streakYears).toBe(3);
    expect(report.answer).toContain("last 3 years");
  });

  /*
    A twenty-year payer that stopped last year has a streak of zero, not
    twenty. The useful reading is "is it paying now", and a run that ended is
    exactly the thing an income investor needs to notice.
  */
  it("ends the count at a gap rather than skipping over it", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, netIncome: 100 },
        { year: 2024, dividendsPaid: 28, netIncome: 100 },
        { year: 2023, dividendsPaid: 25, netIncome: 100 },
      ]),
      MANUFACTURER,
    );

    expect(report.paysDividend).toBe(false);
    expect(report.streakYears).toBe(0);
  });

  it("stops at an interrupted year in the middle of a run", () => {
    const report = buildDividendReport(
      fundamentals([
        { year: 2025, dividendsPaid: 30, netIncome: 100 },
        { year: 2024, dividendsPaid: 0, netIncome: 100 },
        { year: 2023, dividendsPaid: 25, netIncome: 100 },
      ]),
      MANUFACTURER,
    );

    expect(report.streakYears).toBe(1);
  });
});
