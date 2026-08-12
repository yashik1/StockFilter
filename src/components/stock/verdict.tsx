import type { HealthReport, Question } from "@/lib/scoring/health";
import type { Rating } from "@/lib/scoring/types";
import { Card, Metric, RatingBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Colour of the score dial, matched to the rating bands. */
function scoreTone(score: number): Rating {
  if (score >= 7.5) return "good";
  if (score >= 5) return "fair";
  return "poor";
}

/**
 * The headline verdict: one number and one sentence.
 *
 * The number is a financial-health composite only. Valuation is scored but
 * deliberately excluded, because an expensive share price says nothing about
 * whether the underlying business is sound.
 */
export function VerdictCard({
  report,
  companyName,
}: {
  report: HealthReport;
  companyName: string;
}) {
  const score = report.score;
  const tone = score == null ? "unknown" : scoreTone(score);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <ScoreDial score={score} tone={tone} />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Financial health
            </p>
            <p className="mt-0.5 text-lg font-semibold leading-snug">{report.headline}</p>
            <p className="mt-1 text-xs text-muted">
              Based on {companyName}&apos;s
              {report.fiscalYear ? ` FY${report.fiscalYear} ` : " latest "}
              annual filing. Share price is scored separately.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:ml-auto sm:grid-cols-3">
          <Metric
            label="Piotroski F-Score"
            value={
              report.piotroski.maxScore
                ? `${report.piotroski.score}/${report.piotroski.maxScore}`
                : "—"
            }
            hint="Nine checks of financial strength. Higher is stronger."
          />
          <Metric
            label="Altman Z-Score"
            value={report.altman.value ? report.altman.value.z.toFixed(2) : "n/a"}
            hint={
              report.altman.value
                ? "Distance from bankruptcy risk. Higher is safer."
                : report.altman.reason
            }
          />
          <Metric
            label="Beneish M-Score"
            value={report.beneish.value ? report.beneish.value.m.toFixed(2) : "n/a"}
            hint={
              report.beneish.value
                ? "Screens for unusual accounting. Below −1.78 is normal."
                : report.beneish.reason
            }
          />
        </dl>
      </div>
    </Card>
  );
}

function ScoreDial({ score, tone }: { score: number | null; tone: Rating }) {
  const pct = score == null ? 0 : Math.max(0, Math.min(score, 10)) / 10;
  const circumference = 2 * Math.PI * 34;

  const strokes: Record<Rating, string> = {
    good: "var(--good)",
    fair: "var(--fair)",
    poor: "var(--poor)",
    unknown: "var(--unknown)",
  };

  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke={strokes[tone]}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-xl font-bold leading-none">
          {score == null ? "—" : score.toFixed(1)}
        </span>
        <span className="text-[10px] text-muted">out of 10</span>
      </div>
    </div>
  );
}

/**
 * One of the five plain-English questions.
 *
 * The answer leads; the numbers sit underneath for anyone who wants them. Every
 * metric carries a hint so no term is left unexplained.
 */
export function QuestionCard({ question }: { question: Question }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <h3 className="text-sm font-semibold">{question.question}</h3>
        <RatingBadge rating={question.rating} />
      </div>

      <p className="px-5 pb-4 pt-2 text-sm leading-relaxed text-muted-strong">
        {question.answer}
      </p>

      <dl
        className={cn(
          "mt-auto grid gap-4 border-t border-border px-5 py-3",
          question.metrics.length > 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3",
        )}
      >
        {question.metrics.map((m) => (
          <Metric key={m.label} label={m.label} value={m.value} hint={m.hint} />
        ))}
      </dl>
    </Card>
  );
}
