import { fieldValue } from "../fundamentals/normalize";
import type { FinancialPeriod } from "../fundamentals/types";
import { div, gt } from "./math";
import type { PiotroskiResult, Rating, Signal } from "./types";

/**
 * Piotroski F-Score (Piotroski, 2000).
 *
 * Nine binary tests of financial strength across profitability, leverage and
 * operating efficiency. Each passing test scores one point.
 *
 * Signals whose inputs were never reported return `passed: null` and are
 * excluded from `maxScore`, so a bank that cannot report a current ratio is
 * scored out of 8 rather than being silently penalised out of 9.
 */
export function piotroskiFScore(
  current: FinancialPeriod | undefined,
  prior: FinancialPeriod | undefined,
): PiotroskiResult {
  const c = (f: Parameters<typeof fieldValue>[1]) => fieldValue(current, f);
  const p = (f: Parameters<typeof fieldValue>[1]) => fieldValue(prior, f);

  // Piotroski scales by beginning-of-year assets; fall back to current when the
  // prior year is unavailable.
  const roaCurrent = div(c("netIncome"), p("assets") ?? c("assets"));
  const roaPrior = div(p("netIncome"), p("assets"));

  const leverageCurrent = div(c("longTermDebt"), c("assets"));
  const leveragePrior = div(p("longTermDebt"), p("assets"));

  const currentRatioNow = div(c("currentAssets"), c("currentLiabilities"));
  const currentRatioPrior = div(p("currentAssets"), p("currentLiabilities"));

  const grossMarginNow = div(c("grossProfit"), c("revenue"));
  const grossMarginPrior = div(p("grossProfit"), p("revenue"));

  const turnoverNow = div(c("revenue"), c("assets"));
  const turnoverPrior = div(p("revenue"), p("assets"));

  const signals: Signal[] = [
    {
      key: "roa",
      label: "Profitable",
      passed: gt(roaCurrent, 0),
      detail: "The company earned a profit on the assets it owns.",
    },
    {
      key: "cfo",
      label: "Positive cash flow",
      passed: gt(c("operatingCashFlow"), 0),
      detail: "Day-to-day operations brought in more cash than they consumed.",
    },
    {
      key: "roaDelta",
      label: "Profitability improving",
      passed: gt(roaCurrent, roaPrior),
      detail: "It earns more per dollar of assets than it did last year.",
    },
    {
      key: "accruals",
      label: "Profits backed by cash",
      passed: gt(c("operatingCashFlow"), c("netIncome")),
      detail:
        "Reported profit is supported by real cash, not just accounting entries.",
    },
    {
      key: "leverage",
      label: "Debt not rising",
      passed: leverageCurrent != null && leveragePrior != null
        ? leverageCurrent <= leveragePrior
        : null,
      detail: "Long-term debt has not grown as a share of assets.",
    },
    {
      key: "liquidity",
      label: "Bills easier to pay",
      passed: gt(currentRatioNow, currentRatioPrior),
      detail: "It can cover short-term bills more comfortably than last year.",
    },
    {
      key: "dilution",
      label: "No new shares issued",
      passed: c("sharesOutstanding") != null && p("sharesOutstanding") != null
        ? c("sharesOutstanding")! <= p("sharesOutstanding")! * 1.02
        : null,
      detail: "Existing owners were not significantly diluted by new shares.",
    },
    {
      key: "margin",
      label: "Margins improving",
      passed: gt(grossMarginNow, grossMarginPrior),
      detail: "It keeps more of every dollar of sales than it did last year.",
    },
    {
      key: "turnover",
      label: "Assets working harder",
      passed: gt(turnoverNow, turnoverPrior),
      detail: "It generates more sales from the same asset base.",
    },
  ];

  const evaluated = signals.filter((s) => s.passed !== null);
  const score = evaluated.filter((s) => s.passed).length;
  const maxScore = evaluated.length;

  return { score, maxScore, signals, rating: ratePiotroski(score, maxScore) };
}

function ratePiotroski(score: number, maxScore: number): Rating {
  if (maxScore === 0) return "unknown";
  const pct = score / maxScore;
  if (pct >= 0.78) return "good"; // 7+/9
  if (pct >= 0.44) return "fair"; // 4+/9
  return "poor";
}
