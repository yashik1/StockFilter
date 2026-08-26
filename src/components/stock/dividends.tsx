import { Card, CardHeader, Metric, RatingBadge } from "@/components/ui";
import type { DividendReport } from "@/lib/scoring/dividends";
import { money, percent } from "@/lib/format";
import type { ProjectedEvent } from "@/lib/chart-markers";
import { cn } from "@/lib/utils";
import { LocalTime } from "@/components/local-time";

/**
 * Does it pay me, and can it afford to?
 *
 * Sits apart from the five questions rather than joining them, because it is
 * a different kind of question: those judge whether a business is sound, and
 * a perfectly sound business can pay nothing at all. Mixing the two would
 * have marked every reinvesting company down for a choice rather than a
 * weakness.
 *
 * For a company that pays nothing this renders one honest line instead of
 * disappearing. A section that vanishes makes its own claim — that there was
 * nothing to say — when in fact "keeps every dollar and reinvests it" is a
 * real and useful answer.
 */
export function Dividends({
  report,
  currency,
  nextExpected,
}: {
  report: DividendReport;
  currency: string;
  nextExpected?: ProjectedEvent | null;
}) {
  if (!report.paysDividend) {
    return (
      <Card className="p-5">
        <p className="eyebrow">Income</p>
        <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-muted-strong">
          {report.answer}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="What it pays shareholders"
        subtitle="Whether the dividend is covered by what the business actually earns"
      />

      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-muted-strong">
          {report.answer}
        </p>
        <RatingBadge rating={report.rating} />
      </div>

      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-border bg-surface-2/40 px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Paid last year"
          value={money(report.paid, currency)}
          hint="Total cash handed to shareholders over the year, across every share."
          size="sm"
        />
        <Metric
          label="Share of profit paid out"
          value={percent(report.payoutRatio)}
          hint="Out of every $100 of profit, this much left the company as a dividend. Below about 80% leaves room for a bad year."
          size="sm"
        />
        <Metric
          label="Share of cash flow paid out"
          value={percent(report.cashCoverage)}
          hint="The same test against real cash rather than accounting profit. Above 100% means it paid out more than it earned."
          size="sm"
        />
        <Metric
          label="Years paid in a row"
          value={
            report.streakYears > 0
              ? `${report.streakYears}${report.streakYears >= report.yearsAvailable ? "+" : ""}`
              : "—"
          }
          hint="Counting back from the latest filing. A '+' means the run reaches as far back as the filings held here go."
          size="sm"
        />
      </dl>

      {nextExpected && (
        <p className="border-t border-border px-5 py-3 text-xs text-faint">
          {/* Projected from how regularly it has paid before, not a date the
              company has announced. Saying which is the difference between a
              forecast and a fact. */}
          Next payment expected around{" "}
          <LocalTime value={nextExpected.time * 1000} mode="date" />, projected from how
          regularly it has paid before rather than from a date the company has announced.
        </p>
      )}
    </Card>
  );
}

/**
 * A compact income line for somewhere else on the page.
 *
 * Exported separately so a caller can show the one-sentence version without
 * the full panel; currently unused by the stock page, which has room for the
 * whole thing.
 */
export function DividendLine({ report, className }: { report: DividendReport; className?: string }) {
  return (
    <p className={cn("text-sm leading-relaxed text-muted", className)}>{report.answer}</p>
  );
}
