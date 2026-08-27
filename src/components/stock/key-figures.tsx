import { Card, CardHeader, Metric } from "@/components/ui";
import type { KeyFigures } from "@/lib/scoring/key-figures";
import { money, multiple, num, percent, signedPercent } from "@/lib/format";

/**
 * The at-a-glance figures.
 *
 * Sits below the five questions rather than above them: the questions are
 * what this app is for, and a reader who wants the sentence should meet it
 * first. But somebody comparing this company against one they looked up
 * somewhere else needs the standard numbers to be here at all, and until now
 * several of them were being stored in the database and never shown.
 *
 * Every figure carries a hint written the same way the rest of the app writes
 * them — what it means in plain terms, not the formula. Anything that cannot
 * be computed says so rather than showing a zero.
 */
export function KeyFiguresPanel({
  figures,
  currency,
}: {
  figures: KeyFigures;
  currency: string;
}) {
  const {
    freeCashFlow, fcfMargin, grossMargin, operatingMargin, netMargin,
    returnOnEquity, returnOnAssets, eps, interestCoverage,
    shareCountChange, priceToFreeCashFlow,
  } = figures;

  // Nothing computable means nothing to show. An empty grid of dashes makes a
  // claim about the company; an absent panel does not.
  const anything = [
    freeCashFlow, grossMargin, operatingMargin, netMargin,
    returnOnEquity, returnOnAssets, eps, interestCoverage,
    shareCountChange,
  ].some((v) => v != null);
  if (!anything) return null;

  return (
    <Card>
      <CardHeader
        title="The standard figures"
        subtitle="What it earns, what it keeps, and what it costs to run — all from the same filing"
      />

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-4 p-5">
        {/* Leads the panel because it is the number most fundamental analysis
            is built on, and the one this app was not computing at all. */}
        <Metric
          label="Free cash flow"
          value={freeCashFlow == null ? "—" : money(freeCashFlow, currency)}
          tone={freeCashFlow == null ? undefined : freeCashFlow > 0 ? "up" : "down"}
          hint="Cash left after paying for the buildings and equipment the business needs to keep running. What is actually available for dividends, buybacks or paying down debt."
          size="lg"
        />
        <Metric
          label="Earnings per share"
          value={eps == null ? "—" : money(eps, currency)}
          hint="Last year's profit divided by the shares in issue at year end. A company's own reported EPS uses a weighted average across the year, so this sits close to it rather than exactly on it."
        />
        <Metric
          label="Free cash flow margin"
          value={percent(fcfMargin)}
          hint="Of every $100 of sales, this much survived as spendable cash."
        />
        <Metric
          label="Price to free cash flow"
          value={multiple(priceToFreeCashFlow)}
          hint="What the market pays for each $1 of cash the company actually generates. Harder to flatter than a P/E."
        />
      </dl>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-4 border-t border-border bg-surface-2/40 px-5 py-3.5">
        <Metric label="Gross margin" value={percent(grossMargin)} size="sm"
          hint="What is left of each sale after the direct cost of making it — before wages, rent or research." />
        <Metric label="Operating margin" value={percent(operatingMargin)} size="sm"
          hint="What is left after running the business, but before interest and tax." />
        <Metric label="Profit margin" value={percent(netMargin)} size="sm"
          hint="What is left at the very end, after everything." />
        <Metric label="Return on equity" value={percent(returnOnEquity)} size="sm"
          hint="Profit earned on what the owners have put in. Beware of very high figures at heavily indebted companies — borrowing shrinks the denominator." />
        <Metric label="Return on assets" value={percent(returnOnAssets)} size="sm"
          hint="How hard everything the company owns is working." />
        <Metric
          label="Interest cover"
          value={
            interestCoverage == null
              ? "no debt costs"
              : `${num(interestCoverage, 1)}×`
          }
          size="sm"
          tone={interestCoverage != null && interestCoverage < 1.5 ? "down" : undefined}
          hint="How many times over its operating profit covers its interest bill. Under about 1.5 leaves very little room."
        />
        <Metric
          label="Share count"
          value={shareCountChange == null ? "—" : signedPercent(shareCountChange, 1)}
          size="sm"
          // Down is good here, which is the opposite of most figures on the
          // page — so the tone is inverted deliberately rather than by slip.
          tone={
            shareCountChange == null
              ? undefined
              : shareCountChange < 0
                ? "up"
                : shareCountChange > 0
                  ? "down"
                  : "muted"
          }
          hint="Change against last year. Falling means shares were bought back, which hands value to the holders who remain; rising means new shares were issued, diluting them."
        />
      </dl>
    </Card>
  );
}
