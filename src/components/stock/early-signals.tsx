import { ArrowDownRight, ArrowUpRight, Calendar, ExternalLink, Users } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { count, money } from "@/lib/format";
import type { InsiderActivity, InsiderFiling, PendingSale } from "@/lib/signals/insider";
import type { StakeFiling } from "@/lib/signals/stakes";
import type { ProjectedEvent } from "@/lib/chart-markers";

/**
 * The documents journalism gets written from — before the write-up.
 *
 * Everything here comes from SEC EDGAR, filed by the people and firms
 * involved rather than reported by someone describing them afterwards. It is
 * also the most "actionable"-looking thing this app shows, which is exactly
 * why the framing matters more here than anywhere else on the site: an
 * insider sale under a pre-arranged trading plan and an open-market purchase
 * with someone's own money are not the same fact, and showing them the same
 * way would teach a beginner the wrong lesson.
 */

interface Props {
  symbol: string;
  insider: InsiderActivity;
  stakes: StakeFiling[];
  upcoming: ProjectedEvent[];
}

export function EarlySignals({ symbol, insider, stakes, upcoming }: Props) {
  const hasAnything =
    insider.trades.length > 0 ||
    insider.pendingSales.length > 0 ||
    stakes.length > 0 ||
    upcoming.length > 0;

  return (
    <Card>
      <CardHeader
        title="Early signals"
        subtitle="Insider activity, ownership stakes and what's coming — straight from EDGAR, before any article is written about it"
      />

      {!hasAnything ? (
        <EmptyState
          title="Nothing recent"
          description={`No insider trades, pending-sale notices or 5% stake filings from ${symbol} in the last few months. That is the ordinary case, not a gap.`}
        />
      ) : (
        <div className="divide-y divide-border">
          {insider.trades.length > 0 && <InsiderTrades trades={insider.trades} />}
          {insider.pendingSales.length > 0 && <PendingSales sales={insider.pendingSales} />}
          {stakes.length > 0 && <StakeFilings filings={stakes} />}
          {upcoming.length > 0 && <UpcomingCalendar events={upcoming} />}
        </div>
      )}

      <div className="border-t border-border px-5 py-3">
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          Not investment advice, and not a signal to act on by itself — a filing says what
          happened, not why, and insiders trade for ordinary reasons having nothing to do with
          where they think the company is headed.
        </p>
      </div>
    </Card>
  );
}

/**
 * Insider trades — every one, but never levelled to the same weight.
 *
 * An open-market buy or sale (P/S) gets the arrow and the emphasis; a
 * scheduled sale is labelled as scheduled rather than merely listed alongside
 * an unscheduled one; a grant, an exercise, or shares withheld for tax are
 * shown plainly as what they are; not a trade, and not styled like one.
 */
function InsiderTrades({ trades }: { trades: InsiderFiling[] }) {
  return (
    <section className="p-5">
      <h3 className="text-sm font-semibold">Insider trades</h3>
      <p className="mt-1 text-xs text-muted">
        Officers, directors and major shareholders must report within two business days of a
        trade.
      </p>
      <ul className="mt-3 space-y-3">
        {trades.map((filing) =>
          filing.transactions.map((tx, i) => (
            <li
              key={`${filing.accessionNumber}-${i}`}
              className="flex items-start gap-3 text-sm"
            >
              <TradeIcon isOpenMarketTrade={tx.isOpenMarketTrade} direction={tx.direction} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{filing.ownerName}</span>
                  {filing.officerTitle && (
                    <span className="text-xs text-muted">{filing.officerTitle}</span>
                  )}
                  {tx.isOpenMarketTrade && filing.scheduled && (
                    <Badge title="Made under a Rule 10b5-1 trading plan set up in advance, on a schedule decided before now — not a reaction to anything happening at the company today.">
                      Scheduled sale
                    </Badge>
                  )}
                  {!filing.isOfficer && !filing.isDirector && filing.isTenPercentOwner && (
                    <Badge tone="neutral">10%+ owner</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-muted-strong">
                  {tx.label}
                  {tx.shares != null && <> — {count(tx.shares)} shares</>}
                  {/*
                    A price of exactly 0 is how a gift is filed — there is no
                    buyer, so there is no price — and showing "at $0.00 ($0.00)"
                    under a gift reads as a transaction that failed rather than
                    one that was never priced. Only a genuine positive price
                    earns the clause.
                  */}
                  {tx.pricePerShare != null && tx.pricePerShare > 0 && (
                    <> at {money(tx.pricePerShare)}</>
                  )}
                  {tx.value != null && tx.value > 0 && (
                    <span className="font-medium text-ink"> ({money(tx.value)})</span>
                  )}
                </p>
                {tx.sharesOwnedAfter != null && (
                  <p className="text-xs text-faint">
                    Holds {count(tx.sharesOwnedAfter)} shares after this filing.
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <LocalTime
                  value={`${filing.filedAt}T00:00:00Z`}
                  mode="date"
                  className="text-xs text-faint"
                />
                <a
                  href={filing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 flex items-center justify-end gap-0.5 text-xs text-accent hover:underline"
                >
                  Filing <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}

/**
 * True only for an open-market buy without a scheduled plan behind it — the
 * one case worth visually distinguishing, since it is the closest this ever
 * gets to "someone spent their own money because they chose to, today".
 */
function TradeIcon({
  isOpenMarketTrade,
  direction,
}: {
  isOpenMarketTrade: boolean;
  direction: "acquired" | "disposed" | null;
}) {
  if (!isOpenMarketTrade) {
    return <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-faint" aria-hidden />;
  }
  return direction === "acquired" ? (
    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-good-fg" aria-hidden />
  ) : (
    <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
  );
}

/**
 * Form 144 — filed before the sale, not after. The one genuinely "advance"
 * document in this whole panel, so it gets its own section rather than being
 * folded into the trade list above, which is all trades that already happened.
 */
function PendingSales({ sales }: { sales: PendingSale[] }) {
  return (
    <section className="p-5">
      <h3 className="text-sm font-semibold">Pending sales</h3>
      <p className="mt-1 text-xs text-muted">
        Notice filed ahead of a planned sale — the sale itself has not necessarily happened yet.
      </p>
      <ul className="mt-3 space-y-3">
        {sales.map((sale) => (
          <li key={sale.accessionNumber} className="flex items-start gap-3 text-sm">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-fair" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{sale.personName ?? "An insider"}</span>
                {sale.relationship && (
                  <span className="text-xs text-muted">{sale.relationship}</span>
                )}
              </div>
              <p className="mt-0.5 text-muted-strong">
                Filed notice to sell
                {sale.units != null && <> {count(sale.units)} shares</>}
                {sale.aggregateMarketValue != null && (
                  <span className="font-medium text-ink"> ({money(sale.aggregateMarketValue)})</span>
                )}
                {sale.approxSaleDate && (
                  <>
                    {" "}
                    on or after{" "}
                    <LocalTime value={`${sale.approxSaleDate}T00:00:00Z`} mode="date" />
                  </>
                )}
                .
              </p>
              {sale.acquiredVia && (
                <p className="text-xs text-faint">Shares originally obtained via {sale.acquiredVia}.</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <LocalTime value={`${sale.filedAt}T00:00:00Z`} mode="date" className="text-xs text-faint" />
              <a
                href={sale.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 flex items-center justify-end gap-0.5 text-xs text-accent hover:underline"
              >
                Filing <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 5%-ownership stakes. 13D and 13G are shown as what they announce — intent
 * to influence, or a passive threshold crossed — never as one undifferentiated
 * "big shareholder" event.
 */
function StakeFilings({ filings }: { filings: StakeFiling[] }) {
  return (
    <section className="p-5">
      <h3 className="text-sm font-semibold">Ownership stakes</h3>
      <p className="mt-1 text-xs text-muted">
        Filed when someone&apos;s stake crosses 5% of the company.
      </p>
      <ul className="mt-3 space-y-2">
        {filings.map((f) => (
          <li key={f.accessionNumber} className="flex items-center gap-3 text-sm">
            <Users className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="font-medium">
                {f.intent === "activist" ? "Activist stake" : "Passive stake"}
              </span>
              <span className="ml-1.5 text-muted">
                {f.intent === "activist"
                  ? "— disclosed with intent to influence the company"
                  : "— a threshold crossed without stated intent to influence"}
                {f.isAmendment && " (update to an existing position)"}
              </span>
            </div>
            <LocalTime value={`${f.filedAt}T00:00:00Z`} mode="date" className="shrink-0 text-xs text-faint" />
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-0.5 text-xs text-accent hover:underline"
            >
              Filing <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What's projected to come next, from filing cadence alone.
 *
 * Deliberately hedged in its own wording — projectNextEvents infers a typical
 * gap from past filings and extrapolates it forward, which is not the same
 * claim as a confirmed date a company has announced. No confirmed-date source
 * is free (see the plan this panel came from), so the honest thing is to say
 * plainly that this is an estimate.
 */
function UpcomingCalendar({ events }: { events: ProjectedEvent[] }) {
  return (
    <section className="p-5">
      <h3 className="text-sm font-semibold">What&apos;s projected next</h3>
      <p className="mt-1 text-xs text-muted">
        Estimated from how often this has happened before, not a confirmed date.
      </p>
      <ul className="mt-3 space-y-2">
        {events.map((e) => (
          <li key={e.kind} className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 capitalize">
              Next {e.kind}
              <span className="ml-1.5 text-muted">
                — roughly every {e.intervalDays} days, give or take {e.driftDays}
              </span>
            </span>
            <LocalTime value={e.time * 1000} mode="date" className="shrink-0 text-xs font-medium" />
          </li>
        ))}
      </ul>
    </section>
  );
}
