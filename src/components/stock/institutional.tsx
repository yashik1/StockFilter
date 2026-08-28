import { Card, CardHeader, Metric } from "@/components/ui";
import type { InstitutionalOwnership } from "@/lib/signals/institutional";
import { count, money, percent, signedPercent } from "@/lib/format";
import { LocalTime } from "@/components/local-time";

/**
 * Who owned the company, from the quarterly Form 13F filings.
 *
 * The heading says "owned", in the past tense, and that is not a stylistic
 * choice. 13F is due 45 days after the quarter it describes, so the freshest
 * possible figure here is six weeks old and the usual one is three months old.
 * A manager may have sold the whole position the day after the quarter closed
 * and nothing in this data would show it. Every other panel in this section
 * reports what somebody expects now; this one reports what somebody held then,
 * and blurring the two would be the most misleading thing on the page.
 *
 * Public domain, and the only source in this section with no licensing
 * restriction at all.
 */
export function InstitutionalOwners({
  ownership: o,
}: {
  ownership: InstitutionalOwnership;
}) {
  return (
    <Card>
      <CardHeader
        title="Who owned it, at the last count"
        subtitle={
          <>
            Positions held on{" "}
            <LocalTime value={`${o.quarter}T00:00:00Z`} mode="date" /> and disclosed up to 45 days
            later — this is the most recent public record, not a current holding.
          </>
        }
      />

      <p className="max-w-3xl px-5 pt-4 text-[0.9375rem] leading-relaxed text-muted-strong">
        {o.holderCount != null && (
          <>
            <span className="font-semibold text-foreground">{count(o.holderCount)}</span>{" "}
            institutions — pension funds, index funds, asset managers — reported holding this
            company
            {o.percentOfShares != null && (
              <>
                , between them about{" "}
                <span className="font-semibold text-foreground">
                  {percent(o.percentOfShares)}
                </span>{" "}
                of it
              </>
            )}
            .{" "}
          </>
        )}
        Anyone managing over $100m in US shares has to disclose their positions each quarter, which
        is why this list exists at all.
      </p>

      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-border px-5 py-3.5 sm:grid-cols-3">
        <Metric
          label="Institutions holding"
          value={count(o.holderCount)}
          hint="Every manager that filed a 13F naming this company, at any size."
          size="sm"
        />
        <Metric
          label="Share of the company"
          value={percent(o.percentOfShares)}
          hint="Their combined holding against shares outstanding from the latest annual filing."
          size="sm"
        />
        <Metric
          label="Shares held between them"
          value={count(o.totalShares)}
          hint="Across every filer, not only the largest shown below."
          size="sm"
        />
      </dl>

      {/* Scrolls on its own rather than widening the page — the manager names
          are long and this is the widest thing in the section. */}
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/40">
              <th className="eyebrow px-5 py-2 text-left font-medium">Largest holders</th>
              <th className="eyebrow px-3 py-2 text-right font-medium">Shares</th>
              <th className="eyebrow px-3 py-2 text-right font-medium">Value</th>
              <th className="eyebrow px-5 py-2 text-right font-medium">Change on the quarter</th>
            </tr>
          </thead>
          <tbody>
            {o.holders.map((h) => (
              <tr key={h.cik} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-2.5">{h.name}</td>
                <td className="tnum px-3 py-2.5 text-right">{count(h.shares)}</td>
                <td className="tnum px-3 py-2.5 text-right text-muted">{money(h.value)}</td>
                <td
                  className={
                    "tnum px-5 py-2.5 text-right " +
                    (h.change == null
                      ? "text-faint"
                      : h.change > 0
                        ? "text-up"
                        : h.change < 0
                          ? "text-down"
                          : "text-muted")
                  }
                >
                  {/* A dash rather than 0% when the manager was absent last
                      quarter. It may have opened the position, or it may
                      simply not have been among the ten kept — this data
                      cannot tell those apart, so it claims neither. */}
                  {h.change == null ? "—" : signedPercent(h.change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-faint">
        From Form 13F, which covers long positions in US-listed shares only — a manager&apos;s
        short positions, bonds and foreign holdings never appear, and a filer can ask the SEC to
        withhold a position it is still building. Index funds hold large stakes in almost every
        company by construction, so their presence here is not a view on this one.
      </p>
    </Card>
  );
}
