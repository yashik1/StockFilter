import { Card, CardHeader, Metric } from "@/components/ui";
import type { ShortInterest } from "@/lib/signals/short-interest";
import { count, percent, signedPercent, num } from "@/lib/format";
import { LocalTime } from "@/components/local-time";

/**
 * The bet against the company.
 *
 * Short selling was the second least understood idea in FINRA's own 2025
 * survey of retail investors — 23% answered the question correctly, below
 * every concept tested except buying on margin. So the panel opens by saying
 * what a short position is, in one sentence, before showing a number. A figure
 * a reader cannot interpret is worse than no figure, because it still looks
 * like it means something.
 *
 * The settlement date leads rather than trails. This data is collected twice a
 * month and published about eight days afterwards, so the position shown is
 * always a fortnight or so old, and a reader who assumes otherwise is reading
 * a stale number as a live one.
 *
 * No judgement is offered on the level. A heavily shorted company is one that
 * informed people are betting against, and they are wrong often enough that
 * the short squeeze is a well-known phenomenon in its own right. Saying which
 * side is likely correct would be a prediction.
 */
export function ShortInterestPanel({ shortInterest: s }: { shortInterest: ShortInterest }) {
  return (
    <Card>
      <CardHeader
        title="What short sellers are betting"
        subtitle={
          <>
            Measured on <LocalTime value={`${s.settlementDate}T00:00:00Z`} mode="date" /> and
            published about a week later — this is a fortnightly snapshot, not a live position.
          </>
        }
      />

      <p className="max-w-3xl px-5 pt-4 text-[0.9375rem] leading-relaxed text-muted-strong">
        {s.percentOfShares != null ? (
          <>
            About{" "}
            <span className="font-semibold text-foreground">{percent(s.percentOfShares)}</span> of
            this company&apos;s shares have been borrowed and sold by people expecting to buy them
            back cheaper.
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">{count(s.shares)}</span> shares have
            been borrowed and sold by people expecting to buy them back cheaper.
          </>
        )}{" "}
        That is a bet the price falls. Those people can be wrong, and when a heavily shorted share
        rises they have to buy it back, which pushes it up further.
      </p>

      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-border bg-surface-2/40 px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Share of the company"
          value={percent(s.percentOfShares)}
          hint="Against shares outstanding from the latest annual filing, not free float — this app does not hold float, and substituting one for the other would understate the figure wherever insiders hold a large block."
          size="sm"
        />
        <Metric
          label="Shares sold short"
          value={count(s.shares)}
          hint="Borrowed and sold, and not yet bought back."
          size="sm"
        />
        <Metric
          label="Change since last report"
          value={signedPercent(s.change)}
          hint="Against the previous fortnightly report. Rising means the bet against the company is growing."
          size="sm"
          tone={s.change == null ? undefined : s.change > 0 ? "down" : "up"}
        />
        <Metric
          label="Days to buy back"
          value={s.daysToCover == null ? "—" : `${num(s.daysToCover, 1)} days`}
          hint="How many days of ordinary trading it would take to buy back every shorted share. A high number means an exit would be crowded. Published by FINRA rather than computed here."
          size="sm"
        />
      </dl>

      {/*
        Attribution and the licence position in one line. FINRA publishes this
        free but licenses it for non-commercial use, which is recorded properly
        in the module header — this line is the reader-facing half.
      */}
      <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-faint">
        Collected by FINRA from broker-dealers twice a month. It counts positions, not intentions,
        and some of it is hedging rather than a directional bet against the company.
      </p>
    </Card>
  );
}
