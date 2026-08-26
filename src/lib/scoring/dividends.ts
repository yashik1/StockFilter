import { fieldValue } from "../fundamentals/normalize";
import type { NormalizedFundamentals } from "../fundamentals/types";
import { isDistributingTrust } from "./applicability";
import { div } from "./math";
import type { Rating } from "./types";

/**
 * Does this company pay me, and can it afford to?
 *
 * The five questions on a stock page ask whether a business is sound. This
 * asks something a sound business can still answer badly, and it is the
 * question a large share of ordinary investors actually came for — income is
 * the mainstream retail motivation, and only about a third of people can
 * describe how compounding works, which is exactly what a dividend history
 * demonstrates rather than explains.
 *
 * Deliberately **not** a sixth scored question. The health score averages
 * profitability, growth, debt and accounting; folding a dividend into it would
 * mark a company down for reinvesting its profits, which is a different
 * decision rather than a worse one. Valuation is already held out of the score
 * for the same reason — see the comment in health.ts.
 */

export interface DividendReport {
  paysDividend: boolean;
  /** Cash paid to shareholders last year, in the currency of the filing. */
  paid: number | null;
  /**
   * Dividends as a share of profit.
   *
   * Null when there was no profit to divide, which is a different statement
   * from zero — a company paying a dividend out of a loss is doing something
   * a ratio cannot summarise, so the sentence says it instead.
   */
  payoutRatio: number | null;
  /**
   * Dividends as a share of the cash operations actually generated.
   *
   * The better affordability test of the two. Profit involves judgement calls;
   * a dividend is paid in real money, and a company paying out more cash than
   * it earned is funding the difference from reserves or borrowings.
   */
  cashCoverage: number | null;
  /** Consecutive years, counting back from the latest filing, with a payment. */
  streakYears: number;
  /** How many years of history were available to count that streak over. */
  yearsAvailable: number;
  /** One plain sentence about affordability. */
  answer: string;
  rating: Rating;
}

/**
 * Dividends paid in one fiscal year, as a positive amount.
 *
 * Filers disagree about the sign. `PaymentsOfDividends` is a cash *outflow*
 * and most tag it positive, but a minority carry it negative, and one of each
 * in the same history would otherwise read as a company that alternated
 * between paying shareholders and being paid by them.
 */
function dividendsIn(
  fundamentals: NormalizedFundamentals,
  index: number,
): number | null {
  const year = fundamentals.annual[index];
  if (!year) return null;
  const raw = fieldValue(year, "dividendsPaid");
  return raw == null ? null : Math.abs(raw);
}

/** A payment large enough to be a dividend rather than a rounding artefact. */
function isPayment(value: number | null): value is number {
  return value != null && value > 0;
}

export function buildDividendReport(
  fundamentals: NormalizedFundamentals,
  /**
   * The filer's SIC code, not its SectorKind.
   *
   * The coarse sector cannot answer the question this module needs — see
   * isDistributingTrust in applicability.ts for why both of the obvious
   * substitutes classify exactly the wrong companies.
   */
  sicCode: string | number | null | undefined,
): DividendReport {
  const latest = fundamentals.annual[0];
  const paid = dividendsIn(fundamentals, 0);
  const netIncome = latest ? fieldValue(latest, "netIncome") : null;
  const ocf = latest ? fieldValue(latest, "operatingCashFlow") : null;

  const paysDividend = isPayment(paid);

  // Counted from the most recent year backwards: a company that paid for
  // twenty years and stopped last year has a streak of zero, which is the
  // useful reading. A gap ends the count rather than being skipped over.
  let streakYears = 0;
  for (let i = 0; i < fundamentals.annual.length; i++) {
    if (!isPayment(dividendsIn(fundamentals, i))) break;
    streakYears++;
  }

  const payoutRatio =
    paysDividend && netIncome != null && netIncome > 0 ? div(paid, netIncome) : null;
  const cashCoverage = paysDividend && ocf != null && ocf > 0 ? div(paid, ocf) : null;

  return {
    paysDividend,
    paid: paysDividend ? paid : null,
    payoutRatio,
    cashCoverage,
    streakYears,
    yearsAvailable: fundamentals.annual.length,
    ...verdict({
      paysDividend,
      payoutRatio,
      cashCoverage,
      netIncome,
      isTrust: isDistributingTrust(sicCode),
      streakYears,
    }),
  };
}

/**
 * The affordability sentence.
 *
 * Descriptive throughout. It reports what the filings show about whether a
 * payment is covered; it never says whether to buy the shares for it.
 */
function verdict(input: {
  paysDividend: boolean;
  payoutRatio: number | null;
  cashCoverage: number | null;
  netIncome: number | null;
  isTrust: boolean;
  streakYears: number;
}): { answer: string; rating: Rating } {
  const { paysDividend, payoutRatio, cashCoverage, netIncome, isTrust, streakYears } = input;

  if (!paysDividend) {
    return {
      // Not a criticism. Plenty of the strongest companies in the universe pay
      // nothing and put every dollar back into the business.
      answer:
        "This company pays no dividend. It keeps its profits and reinvests them in the " +
        "business instead, so any return would have to come from the share price.",
      rating: "unknown",
    };
  }

  const cashLine =
    cashCoverage != null
      ? ` It paid out ${Math.round(cashCoverage * 100)}% of the cash its operations generated.`
      : "";
  const streakLine =
    streakYears >= 3 ? ` It has paid in each of the last ${streakYears} years.` : "";

  if (netIncome != null && netIncome <= 0) {
    return {
      answer:
        "It paid a dividend while making a loss, so the payment did not come out of " +
        `profits — it came from reserves, borrowing or asset sales.${cashLine}${streakLine}`,
      rating: "poor",
    };
  }

  if (payoutRatio == null) {
    return {
      answer:
        "It pays a dividend, but not enough was reported to judge whether profits cover " +
        `it.${cashLine}${streakLine}`,
      rating: "unknown",
    };
  }

  const cents = Math.round(payoutRatio * 100);
  const covered = cashCoverage == null || cashCoverage <= 1;

  /*
    Property trusts are the standing exception, and they are checked before
    the payout rule below rather than after it.

    A REIT must distribute at least 90% of its taxable income to keep its tax
    status, and reports profit after depreciating buildings that are not
    wearing out at anything like that rate — so a payout well above 100% of
    net income is ordinary. Realty Income, a REIT that has paid every year for
    over a decade and covers its distribution out of 73% of its operating cash
    flow, was being told it "paid out more than it earned" at 276% of profit.
    Which is arithmetically true and, as a judgement about affordability,
    simply wrong.
  */
  if (isTrust) {
    return {
      answer:
        `It pays out ${cents}% of its profit. Property trusts are required to distribute ` +
        "most of their income and report profit after heavy depreciation, so a figure " +
        `above 100% is normal here rather than a warning.${cashLine}${streakLine}`,
      rating: covered ? "good" : "fair",
    };
  }

  if (payoutRatio > 1) {
    return {
      answer:
        `It paid out more than it earned — ${cents} cents for every dollar of profit. ` +
        "A payment above earnings has to be funded from somewhere else, so it is worth " +
        `checking whether that can continue.${cashLine}${streakLine}`,
      rating: "poor",
    };
  }

  if (payoutRatio > 0.8 || !covered) {
    return {
      answer:
        `It pays out ${cents} cents of every dollar of profit, which leaves little room ` +
        `for the payment to survive a bad year.${cashLine}${streakLine}`,
      rating: "fair",
    };
  }

  return {
    answer:
      `It pays out ${cents} cents of every dollar of profit and keeps the rest, which ` +
      `leaves the payment comfortably covered.${cashLine}${streakLine}`,
    rating: "good",
  };
}
