import { fieldValue } from "../fundamentals/normalize";
import type { FinancialPeriod } from "../fundamentals/types";
import {
  FINANCIAL_SUPPRESSION_REASON,
  INSUFFICIENT_DATA_REASON,
  type SectorKind,
} from "./applicability";
import { add, coalesce, div, round, sub } from "./math";
import type { AltmanResult, ScoreResult } from "./types";

/**
 * Altman Z-Score — distance from bankruptcy.
 *
 * Two variants are used, matching the populations they were fitted on:
 *
 *  - Manufacturers (SIC 2000-3999) get the original 1968 five-factor model,
 *    which uses market capitalisation in the leverage term.
 *  - Everyone else gets the four-factor Z'' model, which drops asset turnover
 *    (it varies too much across service industries to be comparable) and uses
 *    book equity instead of market value.
 *
 * Financial companies get no score at all. The model has no meaning for a
 * balance sheet with no working capital, and reporting one anyway would be
 * worse than reporting nothing.
 */
export function altmanZScore(
  period: FinancialPeriod | undefined,
  sector: SectorKind,
  marketCap: number | null,
): ScoreResult<AltmanResult> {
  if (sector === "financial") {
    return { value: null, applicable: false, reason: FINANCIAL_SUPPRESSION_REASON };
  }
  if (!period) {
    return { value: null, applicable: false, reason: INSUFFICIENT_DATA_REASON };
  }

  const f = (k: Parameters<typeof fieldValue>[1]) => fieldValue(period, k);

  const assets = f("assets");
  const liabilities = f("liabilities");
  const workingCapital = sub(f("currentAssets"), f("currentLiabilities"));

  // EBIT: prefer operating income, else rebuild it from pre-tax income.
  const ebit = coalesce(
    f("operatingIncome"),
    add(f("incomeBeforeTax"), f("interestExpense")),
  );

  const x1 = div(workingCapital, assets);
  const x2 = div(f("retainedEarnings"), assets);
  const x3 = div(ebit, assets);

  const isManufacturing = sector === "manufacturing";

  // The original model uses market value of equity; Z'' uses book value.
  const equityValue = isManufacturing ? marketCap : f("equity");
  const x4 = div(equityValue, liabilities);

  if (x1 == null || x2 == null || x3 == null || x4 == null) {
    return { value: null, applicable: false, reason: INSUFFICIENT_DATA_REASON };
  }

  if (isManufacturing) {
    const x5 = div(f("revenue"), assets);
    if (x5 == null) {
      return { value: null, applicable: false, reason: INSUFFICIENT_DATA_REASON };
    }
    const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
    return {
      value: {
        z: round(z),
        variant: "manufacturing",
        zone: z > 2.99 ? "safe" : z >= 1.81 ? "grey" : "distress",
        rating: z > 2.99 ? "good" : z >= 1.81 ? "fair" : "poor",
      },
      applicable: true,
    };
  }

  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  return {
    value: {
      z: round(z),
      variant: "non-manufacturing",
      zone: z > 2.6 ? "safe" : z >= 1.1 ? "grey" : "distress",
      rating: z > 2.6 ? "good" : z >= 1.1 ? "fair" : "poor",
    },
    applicable: true,
  };
}
