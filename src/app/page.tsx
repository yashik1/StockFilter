import Link from "next/link";
import { TranslationHero } from "@/components/translation-hero";
import { WatchlistPanel, WatchlistSync } from "@/components/watchlist";
import { MarketOverview, MarketSetupHint } from "@/components/market-overview";
import { getMarketSnapshot, hasMarketData } from "@/lib/market";
import { getIndexStrip, type IndexReading } from "@/lib/indices";
import { Badge, Card, RatingBadge } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { money, num, percent, signedPercent } from "@/lib/format";
import { providerStatus } from "@/lib/providers";
import type { Rating } from "@/lib/scoring/types";
import { getHealthiest, getUniverseCount } from "@/lib/screener";
import { websiteLd } from "@/lib/structured-data";
import { StructuredData } from "@/components/structured-data";
import { auth } from "@/lib/auth";
import { listWatchlist } from "@/lib/watchlist/actions";

export const dynamic = "force-dynamic";

function healthRating(score: number | null): Rating {
  if (score == null) return "unknown";
  if (score >= 7.5) return "good";
  if (score >= 5) return "fair";
  return "poor";
}

export default async function HomePage() {
  const [healthiest, universeCount, market, indices, session, saved] = await Promise.all([
    getHealthiest(6),
    getUniverseCount(),
    getMarketSnapshot(5),
    getIndexStrip(),
    auth().catch(() => null),
    // Returns an empty list when signed out, so this costs nothing for a
    // visitor and does not need a branch here.
    listWatchlist(),
  ]);
  const status = providerStatus();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div>
      <StructuredData data={websiteLd()} />

      <TranslationHero />

      <IndexStrip readings={indices} universeCount={universeCount} asOf={market.asOf} />

      <div className="space-y-11 pt-11">
        {hasMarketData(market) ? (
          <MarketOverview snapshot={market} />
        ) : (
          universeCount != null && universeCount > 0 && <MarketSetupHint />
        )}

        {/* The merge runs once, here, because the dashboard is where somebody
            lands after signing in — and it must happen before the panel below
            is read, or a freshly-merged company appears only on the next
            visit. */}
        <WatchlistSync signedIn={signedIn} />
        <WatchlistPanel signedIn={signedIn} saved={saved} />

        <section aria-labelledby="healthiest-heading">
          <div className="mb-[18px] flex items-end justify-between gap-5">
            <div>
              <p className="eyebrow">Ranked from the filings</p>
              <h2 id="healthiest-heading" className="font-display mt-1.5 text-[1.875rem]">
                Financially healthiest right now
              </h2>
            </div>
            <Link
              href="/screen"
              className="font-display shrink-0 text-sm font-semibold text-accent hover:underline"
            >
              Open screener →
            </Link>
          </div>

          {healthiest.status === "ok" ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
              {healthiest.rows.map((r) => (
                <Card key={r.symbol} as="article" className="p-4" interactive>
                  <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="block">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="text-[0.9375rem] font-bold tracking-[0.02em]">{r.symbol}</p>
                        <p className="truncate text-xs text-faint">{r.name}</p>
                      </div>
                      <RatingBadge
                        rating={healthRating(r.healthScore)}
                        label={r.healthScore != null ? `${r.healthScore.toFixed(1)}/10` : "—"}
                      />
                    </div>

                    {/*
                      A minimum height rather than a clamp, so the metric rules
                      below line up across a row whether a headline runs to one
                      line or three. Cards of unequal internal rhythm are what
                      makes a grid look assembled rather than drawn.
                    */}
                    <p className="mt-3 min-h-[2.8em] text-[0.8125rem] leading-relaxed text-muted">
                      {r.headline}
                    </p>

                    <dl className="mt-3.5 grid grid-cols-3 gap-2.5 border-t border-border pt-3">
                      <Cell label="Value" value={money(r.marketCap)} />
                      <Cell label="Growth" value={percent(r.revenueGrowth)} />
                      <Cell label="Margin" value={percent(r.netMargin)} />
                    </dl>
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-5">
              <p className="font-display text-base font-semibold">
                {healthiest.status === "no-database"
                  ? "Rankings need a database"
                  : "No companies loaded yet"}
              </p>
              <p className="mt-1.5 max-w-2xl text-sm text-muted">
                Individual stock pages work without any setup — search above or try{" "}
                <Link href="/stock/AAPL" className="text-accent underline">
                  AAPL
                </Link>
                . To rank and filter across the whole universe, see the{" "}
                <Link href="/screen" className="text-accent underline">
                  screener
                </Link>{" "}
                for setup steps.
              </p>
            </Card>
          )}
        </section>

        <section aria-labelledby="sources-heading">
          <p className="eyebrow">Provenance</p>
          <h2 id="sources-heading" className="font-display mt-1.5 mb-[18px] text-[1.875rem]">
            Where the data comes from
          </h2>

          {/*
            A table rather than three cards. These rows are the same four facts
            about four sources, which is what a table is for — and it lets a
            reader compare the status column straight down the page instead of
            hunting for it inside three separate blocks.
          */}
          <div className="scroll-x">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Source</Th>
                  <Th>Supplies</Th>
                  <Th>Why it</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                <SourceRow
                  name="SEC EDGAR"
                  supplies="Fundamentals, filings, SIC codes"
                  why="Authoritative, no key, no daily cap"
                  ok
                />
                <SourceRow
                  name="Twelve Data"
                  supplies="Price bars and quotes"
                  why="Free tier serves the full intraday range"
                  ok={status.charts}
                />
                <SourceRow
                  name="Finnhub"
                  supplies="News, logos, peers"
                  why="Sixty quote requests a minute, free"
                  ok={status.news}
                />
                <SourceRow
                  name="Yahoo Finance"
                  supplies="Dividends, splits, index and commodity prices"
                  why="Needs no key, and covers what the others do not"
                  ok
                />
              </tbody>
            </table>
          </div>

          <p className="mt-3.5 max-w-2xl text-xs leading-relaxed text-faint">
            Coverage: {status.coverage}
            {universeCount != null && ` · ${universeCount} companies loaded`}
            {status.missing.length > 0 && <> · Optional keys not set: {status.missing.join(", ")}</>}
          </p>
        </section>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow text-[0.625rem]">{label}</dt>
      <dd className="tnum mt-0.5 text-[0.84375rem] font-bold">{value}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="eyebrow px-2 py-2 text-left text-[0.6875rem]">
      {children}
    </th>
  );
}

function SourceRow({
  name,
  supplies,
  why,
  ok,
}: {
  name: string;
  supplies: string;
  why: string;
  ok: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-2 py-2.5 font-semibold">{name}</td>
      <td className="px-2 py-2.5 text-muted">{supplies}</td>
      <td className="px-2 py-2.5 text-muted">{why}</td>
      <td className="px-2 py-2.5">
        {ok ? <Badge tone="accent">Active</Badge> : <Badge>Needs key</Badge>}
      </td>
    </tr>
  );
}

/**
 * The orientation strip: what kind of day is it, before anything specific.
 *
 * Cells are divided by 1px rules rather than gaps, so the row reads as one
 * ruled band across the page — the same device the header uses. A gauge that
 * could not be fetched prints a dash rather than vanishing, because a strip
 * that silently changes width is harder to trust than one that admits a gap.
 */
function IndexStrip({
  readings,
  universeCount,
  asOf,
}: {
  readings: IndexReading[];
  universeCount: number | null;
  asOf: Date | string | null;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] border-b border-border">
      {readings.map((r) => (
        <div key={r.symbol} className="border-r border-border px-5 py-[18px] last:border-r-0">
          <p className="eyebrow">{r.label}</p>
          <p className="display mt-1.5 text-[1.625rem]">
            {r.value == null ? "—" : r.format === "rate" ? `${num(r.value, 3)}%` : num(r.value, 2)}
          </p>
          <p
            className={`tnum mt-0.5 text-[0.8125rem] ${
              r.changePercent == null ? "text-faint" : r.changePercent >= 0 ? "text-up" : "text-down"
            }`}
          >
            {r.changePercent == null ? "—" : signedPercent(r.changePercent)}
          </p>
        </div>
      ))}

      <div className="px-5 py-[18px]">
        <p className="eyebrow">Companies scored</p>
        <p className="display mt-1.5 text-[1.625rem]">
          {universeCount == null ? "—" : num(universeCount, 0)}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-faint">
          {asOf ? (
            <>
              refreshed <LocalTime value={asOf} mode="time" />
            </>
          ) : (
            "not yet ingested"
          )}
        </p>
      </div>
    </div>
  );
}
