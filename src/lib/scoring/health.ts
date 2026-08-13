import { fieldValue } from "../fundamentals/normalize";
import type { NormalizedFundamentals } from "../fundamentals/types";
import { money, multiple, percent } from "../format";
import { altmanZScore } from "./altman";
import { type SectorKind } from "./applicability";
import { beneishMScore } from "./beneish";
import { div, round, sub } from "./math";
import { piotroskiFScore } from "./piotroski";
import type { AltmanResult, BeneishResult, PiotroskiResult, Rating, ScoreResult } from "./types";

/** One of the five plain-English questions shown on a stock page. */
export interface Question {
  key: "profitable" | "growing" | "debt" | "valuation" | "accounting";
  question: string;
  /** One sentence a non-expert can act on, written in plain language. */
  answer: string;
  rating: Rating;
  /** Supporting figures, each safe to show without further explanation. */
  metrics: { label: string; value: string; hint: string }[];
}

export interface HealthReport {
  /** 0-10, or null when too little was reported to judge. */
  score: number | null;
  headline: string;
  questions: Question[];
  piotroski: PiotroskiResult;
  altman: ScoreResult<AltmanResult>;
  beneish: ScoreResult<BeneishResult>;
  /** Link to the filing the figures were taken from. */
  sourceFilingUrl: string | null;
  fiscalYear: number | null;
}

const RATING_POINTS: Record<Rating, number | null> = {
  good: 10,
  fair: 6,
  poor: 2,
  unknown: null,
};

/**
 * Builds the full plain-English health report for one company.
 *
 * Deliberately descriptive, never prescriptive: every sentence describes what
 * the filings say, and none suggests buying or selling. Anything that cannot be
 * computed says so rather than guessing.
 */
export function buildHealthReport(
  fundamentals: NormalizedFundamentals,
  sector: SectorKind,
  marketCap: number | null,
): HealthReport {
  // Statements are reported in the filer's own currency — CAD for a Canadian
  // company — and labelling those figures with a plain "$" reads as USD, which
  // is simply wrong. The unit travels on every fact, so it is read from there.
  const currency = fundamentals.annual[0]?.facts.assets?.unit ?? "USD";
  const amount = (value: number | null | undefined) => money(value, currency);
  const current = fundamentals.annual[0];
  const prior = fundamentals.annual[1];
  const f = (k: Parameters<typeof fieldValue>[1]) => fieldValue(current, k);
  const p = (k: Parameters<typeof fieldValue>[1]) => fieldValue(prior, k);

  const piotroski = piotroskiFScore(current, prior);
  const altman = altmanZScore(current, sector, marketCap);
  const beneish = beneishMScore(current, prior, sector);

  const questions: Question[] = [
    profitabilityQuestion(f, amount),
    growthQuestion(f, p, fundamentals, amount),
    debtQuestion(f, altman, sector, amount),
    valuationQuestion(f, marketCap, amount),
    accountingQuestion(beneish),
  ];

  // Valuation is deliberately excluded from the health score. Whether a share
  // price is high is a separate question from whether the business is sound —
  // an excellent company can be expensive, and blending the two would make the
  // headline number mean neither thing clearly. Valuation is still shown, just
  // scored on its own.
  const points = questions
    .filter((q) => q.key !== "valuation")
    .map((q) => RATING_POINTS[q.rating])
    .filter((v): v is number => v !== null);
  const score = points.length
    ? round(points.reduce((a, b) => a + b, 0) / points.length, 1)
    : null;

  return {
    score,
    headline: headlineFor(score, fundamentals.entityName),
    questions,
    piotroski,
    altman,
    beneish,
    sourceFilingUrl: current?.facts.assets?.sourceFilingUrl ?? null,
    fiscalYear: current?.fiscalYear ?? null,
  };
}

function headlineFor(score: number | null, name: string): string {
  if (score == null) return `${name} has not reported enough data to assess.`;
  if (score >= 8) return "Strong finances across the board.";
  if (score >= 6.5) return "Generally healthy, with a few things to watch.";
  if (score >= 4.5) return "A mixed picture — some clear strengths and some weaknesses.";
  if (score >= 3) return "Several areas of financial weakness.";
  return "Significant financial weakness across most measures.";
}

type Getter = (k: Parameters<typeof fieldValue>[1]) => number | null;
/** Formats an amount in the filing's own currency. */
type Amount = (value: number | null | undefined) => string;

function profitabilityQuestion(f: Getter, amount: Amount): Question {
  const netIncome = f("netIncome");
  const revenue = f("revenue");
  const margin = div(netIncome, revenue);
  const roa = div(netIncome, f("assets"));
  const ocf = f("operatingCashFlow");

  let rating: Rating = "unknown";
  let answer = "This company has not reported enough detail to tell.";

  if (netIncome != null && margin != null) {
    const cents = Math.round(Math.abs(margin) * 100);
    if (netIncome > 0) {
      rating = margin >= 0.1 ? "good" : "fair";
      answer =
        `Yes. It keeps about ${cents} cents of every dollar of sales as profit, ` +
        `earning ${amount(netIncome)} last year.`;
    } else {
      rating = "poor";
      answer =
        `No. It lost ${amount(Math.abs(netIncome))} last year, ` +
        `losing about ${cents} cents on every dollar of sales.`;
    }
    if (ocf != null && ocf < 0 && netIncome > 0) {
      answer += " Note that operations still consumed cash despite the reported profit.";
      rating = "fair";
    }
  } else if (netIncome != null) {
    rating = netIncome > 0 ? "good" : "poor";
    answer = netIncome > 0
      ? `Yes. It earned ${amount(netIncome)} last year.`
      : `No. It lost ${amount(Math.abs(netIncome))} last year.`;
  }

  return {
    key: "profitable",
    question: "Is it profitable?",
    answer,
    rating,
    metrics: [
      { label: "Net profit margin", value: percent(margin), hint: "Profit kept from each dollar of sales." },
      { label: "Return on assets", value: percent(roa), hint: "Profit earned per dollar of assets owned." },
      { label: "Operating cash flow", value: amount(ocf), hint: "Actual cash generated by the business." },
    ],
  };
}

function growthQuestion(
  f: Getter,
  p: Getter,
  fundamentals: NormalizedFundamentals,
  amount: Amount,
): Question {
  const revNow = f("revenue");
  const revPrior = p("revenue");
  const growth = revNow != null && revPrior != null && revPrior !== 0
    ? (revNow - revPrior) / Math.abs(revPrior)
    : null;

  // Three-year compound growth, when enough history exists.
  const older = fundamentals.annual[3];
  const revOlder = older ? fieldValue(older, "revenue") : null;
  const cagr = revNow != null && revOlder != null && revOlder > 0
    ? (revNow / revOlder) ** (1 / 3) - 1
    : null;

  let rating: Rating = "unknown";
  let answer = "Not enough history has been reported to judge growth.";

  if (growth != null) {
    const pct = Math.abs(growth * 100).toFixed(1);
    if (growth >= 0.15) {
      rating = "good";
      answer = `Yes, quickly. Sales grew ${pct}% last year.`;
    } else if (growth >= 0.03) {
      rating = "fair";
      answer = `Slowly. Sales grew ${pct}% last year.`;
    } else if (growth >= 0) {
      rating = "fair";
      answer = `Barely. Sales were roughly flat, up ${pct}%.`;
    } else {
      rating = "poor";
      answer = `No. Sales shrank ${pct}% last year.`;
    }
  }

  return {
    key: "growing",
    question: "Is it growing?",
    answer,
    rating,
    metrics: [
      { label: "Revenue growth (1y)", value: percent(growth), hint: "Change in sales versus last year." },
      { label: "Revenue growth (3y avg)", value: percent(cagr), hint: "Average yearly sales growth over three years." },
      { label: "Revenue", value: amount(revNow), hint: "Total sales in the last reported year." },
    ],
  };
}

/**
 * Debt assessment.
 *
 * Rated on actual borrowings net of cash, measured against the cash flow
 * available to repay them — not on total liabilities. Total liabilities include
 * trade payables and deferred revenue, which are ordinary operating items rather
 * than debt; judging by that measure alone rates cash-rich companies such as
 * Apple as distressed, which is plainly wrong.
 *
 * The "for every $1 it owes" sentence is still shown, because it is the clearest
 * summary of the balance sheet, but it no longer drives the rating on its own.
 */
function debtQuestion(
  f: Getter,
  altman: ScoreResult<AltmanResult>,
  sector: SectorKind,
  amount: Amount,
): Question {
  const assets = f("assets");
  const liabilities = f("liabilities");
  const equity = f("equity");
  const cash = f("cash");
  const ocf = f("operatingCashFlow");

  const coverage = div(assets, liabilities);
  const debtToEquity = div(liabilities, equity);
  const currentRatio = div(f("currentAssets"), f("currentLiabilities"));

  const longTerm = f("longTermDebt");
  const shortTerm = f("shortTermDebt");
  const totalDebt =
    longTerm == null && shortTerm == null ? null : (longTerm ?? 0) + (shortTerm ?? 0);
  const netDebt = totalDebt == null ? null : totalDebt - (cash ?? 0);
  const yearsToRepay = netDebt != null && netDebt > 0 ? div(netDebt, ocf) : null;

  let rating: Rating = "unknown";
  let answer = "This company has not reported enough detail to tell.";
  const owns = coverage != null ? coverage.toFixed(2) : null;
  const ownsLine = owns ? `For every $1 it owes, it owns $${owns} in assets.` : "";

  if (sector === "financial") {
    rating = coverage != null && coverage >= 1.05 ? "fair" : "poor";
    answer =
      `${ownsLine} Banks and insurers always carry high debt — that is how lending ` +
      `works — so this is normal for the industry and not comparable with other sectors.`;
  } else if (netDebt != null && netDebt <= 0) {
    rating = "good";
    answer =
      `No — it holds more cash than debt, with ${amount(Math.abs(netDebt))} left over ` +
      `after paying off every borrowing. ${ownsLine}`;
  } else if (yearsToRepay != null && yearsToRepay > 0) {
    const yrs = yearsToRepay.toFixed(1);
    if (yearsToRepay < 1) {
      rating = "good";
      answer = `No. Its borrowings would take under a year of cash flow to clear. ${ownsLine}`;
    } else if (yearsToRepay < 3) {
      rating = "good";
      answer = `No. At its current cash flow it could clear its debt in about ${yrs} years. ${ownsLine}`;
    } else if (yearsToRepay < 6) {
      rating = "fair";
      answer = `Manageable, but notable. Clearing its debt would take about ${yrs} years of cash flow. ${ownsLine}`;
    } else {
      rating = "poor";
      answer = `Yes. Clearing its debt would take roughly ${yrs} years of cash flow. ${ownsLine}`;
    }
  } else if (netDebt != null && netDebt > 0 && ocf != null && ocf <= 0) {
    rating = "poor";
    answer = `Yes — it carries debt while operations are consuming cash rather than generating it. ${ownsLine}`;
  } else if (coverage != null) {
    // Debt not broken out; fall back to the balance-sheet-wide view.
    if (coverage >= 2) {
      rating = "good";
      answer = `It does not appear so. ${ownsLine}`;
    } else if (coverage >= 1.3) {
      rating = "fair";
      answer = `Manageable. ${ownsLine}`;
    } else if (coverage > 1) {
      rating = "fair";
      answer = `It is tight. ${ownsLine}`;
    } else {
      rating = "poor";
      answer = `Yes. It owes more than it owns — only $${owns} in assets for every $1 of liabilities.`;
    }
  }

  if (altman.value?.zone === "distress" && rating !== "unknown") {
    rating = "poor";
    answer += " A bankruptcy-risk model also places it in its distress range.";
  }

  return {
    key: "debt",
    question: "Is it drowning in debt?",
    answer: answer.trim(),
    rating,
    metrics: [
      // Net debt is meaningless for a bank: customer deposits are its raw
      // material, not borrowings, and are never tagged as debt.
      {
        label: "Net debt",
        value: sector === "financial" ? "n/a for banks" : netDebt == null ? "—" : amount(netDebt),
        hint: "Borrowings left after using all available cash.",
      },
      {
        label: "Years of cash flow to repay",
        value:
          sector === "financial"
            ? "n/a for banks"
            : yearsToRepay != null
              ? yearsToRepay.toFixed(1)
              : netDebt != null && netDebt <= 0
                ? "None needed"
                : "—",
        hint: "How long current cash flow would take to clear net debt.",
      },
      { label: "Assets per $1 of liabilities", value: multiple(coverage), hint: "How much it owns for every dollar it owes." },
      { label: "Debt to equity", value: multiple(debtToEquity), hint: "Total liabilities compared with owners' stake." },
      { label: "Current ratio", value: multiple(currentRatio), hint: "Short-term assets versus bills due within a year." },
    ],
  };
}

function valuationQuestion(f: Getter, marketCap: number | null, amount: Amount): Question {
  const netIncome = f("netIncome");
  const equity = f("equity");
  const revenue = f("revenue");
  const pe = netIncome != null && netIncome > 0 ? div(marketCap, netIncome) : null;
  const pb = div(marketCap, equity);
  const ps = div(marketCap, revenue);

  let rating: Rating = "unknown";
  // Distinguish "we have no price" from "there are no profits to compare to" —
  // the first is a setup gap, the second is a fact about the company.
  let answer =
    marketCap == null
      ? "No share price is available, so this company cannot be valued here. " +
        "Valuation needs a price source — see the setup notes for adding a free key."
      : "A price could not be compared with earnings for this company.";

  if (pe != null) {
    const v = pe.toFixed(1);
    if (pe < 15) {
      rating = "good";
      answer = `On the cheaper side. Investors pay $${v} for every $1 of yearly profit.`;
    } else if (pe < 30) {
      rating = "fair";
      answer = `Around average. Investors pay $${v} for every $1 of yearly profit.`;
    } else {
      rating = "poor";
      answer =
        `Expensive. Investors pay $${v} for every $1 of yearly profit, ` +
        `so a lot of future growth is already priced in.`;
    }
  } else if (netIncome != null && netIncome <= 0) {
    rating = "unknown";
    answer =
      "It has no profits to compare a price against, because it lost money last year.";
  }

  return {
    key: "valuation",
    question: "Is it cheap or expensive?",
    answer,
    rating,
    metrics: [
      { label: "Price to earnings", value: multiple(pe), hint: "Price paid per dollar of annual profit." },
      { label: "Price to book", value: multiple(pb), hint: "Price paid per dollar of net assets." },
      { label: "Price to sales", value: multiple(ps), hint: "Price paid per dollar of annual sales." },
    ],
  };
}

function accountingQuestion(beneish: ScoreResult<BeneishResult>): Question {
  let rating: Rating = "unknown";
  let answer =
    beneish.reason ?? "There is not enough history to check the accounting for warning signs.";

  if (beneish.value) {
    if (beneish.value.flagged) {
      rating = "poor";
      answer =
        "Some accounting patterns here resemble those found in companies that " +
        "overstated earnings. This is a statistical flag, not evidence of wrongdoing — " +
        "it is a prompt to read the filings closely.";
    } else {
      rating = beneish.value.rating === "good" ? "good" : "fair";
      answer =
        "Nothing unusual. Its accounting patterns look like those of companies " +
        "that report earnings straightforwardly.";
    }
  }

  return {
    key: "accounting",
    question: "Are there accounting red flags?",
    answer,
    rating,
    metrics: [
      {
        label: "Beneish M-Score",
        value: beneish.value ? beneish.value.m.toFixed(2) : "—",
        hint: "Above -1.78 flags earnings patterns worth a closer look.",
      },
    ],
  };
}

/** Convenience: net-debt style summary used by the balance sheet visual. */
export function balanceSheetSummary(fundamentals: NormalizedFundamentals) {
  const current = fundamentals.annual[0];
  const assets = fieldValue(current, "assets");
  const liabilities = fieldValue(current, "liabilities");
  const equity = fieldValue(current, "equity") ?? sub(assets, liabilities);
  return { assets, liabilities, equity, current };
}
