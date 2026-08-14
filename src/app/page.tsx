import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TranslationHero } from "@/components/translation-hero";
import { WatchlistPanel } from "@/components/watchlist";
import { MarketOverview, MarketSetupHint } from "@/components/market-overview";
import { getMarketSnapshot, hasMarketData } from "@/lib/market";
import { Badge, Card, CardHeader, RatingBadge } from "@/components/ui";
import { money, percent } from "@/lib/format";
import { providerStatus } from "@/lib/providers";
import type { Rating } from "@/lib/scoring/types";
import { getHealthiest, getUniverseCount } from "@/lib/screener";

export const dynamic = "force-dynamic";

function healthRating(score: number | null): Rating {
  if (score == null) return "unknown";
  if (score >= 7.5) return "good";
  if (score >= 5) return "fair";
  return "poor";
}

export default async function HomePage() {
  const [healthiest, universeCount, market] = await Promise.all([
    getHealthiest(6),
    getUniverseCount(),
    getMarketSnapshot(5),
  ]);
  const status = providerStatus();

  return (
    <div className="space-y-10">
      <TranslationHero />

      {hasMarketData(market) ? (
        <MarketOverview snapshot={market} />
      ) : (
        universeCount != null && universeCount > 0 && <MarketSetupHint />
      )}

      <WatchlistPanel />

      {/* ---- healthiest companies (needs the database) ---- */}
      <section aria-labelledby="healthiest-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Ranked from the filings</p>
            <h2 id="healthiest-heading" className="mt-1 text-lg font-semibold tracking-tight">
              Financially healthiest right now
            </h2>
            <p className="text-sm text-muted">
              Strongest balance sheets in the screening universe.
            </p>
          </div>
          <Link
            href="/screen"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            Open screener <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>

        {healthiest.status === "ok" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {healthiest.rows.map((r) => (
              <Link key={r.symbol} href={`/stock/${encodeURIComponent(r.symbol)}`}>
                <Card className="h-full p-4" interactive>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.symbol}</p>
                      <p className="truncate text-xs text-muted">{r.name}</p>
                    </div>
                    <RatingBadge
                      rating={healthRating(r.healthScore)}
                      label={r.healthScore != null ? `${r.healthScore.toFixed(1)}/10` : "—"}
                    />
                  </div>
                  {r.headline && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
                      {r.headline}
                    </p>
                  )}
                  <dl className="mt-3 flex gap-4 text-xs">
                    <div>
                      <dt className="text-muted">Value</dt>
                      <dd className="tnum font-medium">{money(r.marketCap)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Growth</dt>
                      <dd className="tnum font-medium">{percent(r.revenueGrowth)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Margin</dt>
                      <dd className="tnum font-medium">{percent(r.netMargin)}</dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="p-5">
            <p className="text-sm font-medium">
              {healthiest.status === "no-database"
                ? "Rankings need a database"
                : "No companies loaded yet"}
            </p>
            <p className="mt-1 text-sm text-muted">
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

      {/* ---- data provenance ---- */}
      <section aria-labelledby="sources-heading">
        <Card>
          <CardHeader
            title="Where the data comes from"
            subtitle="Every number on this site traces back to a primary source"
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Source
              name="SEC EDGAR"
              role="Financial statements and filings"
              detail="Official XBRL data filed by the companies themselves. Covers US filers and Canadian companies cross-listed in the US."
              ok
            />
            <Source
              name="Twelve Data"
              role="Price history and quotes"
              detail="Minute, hourly and daily history used for the price charts. A free key is an email signup."
              ok={status.charts}
            />
            <Source
              name="Finnhub"
              role="News and company profiles"
              detail="Recent coverage and industry classification."
              ok={status.news}
            />
          </div>
          <div className="border-t border-border px-5 py-3 text-xs text-muted">
            Coverage: {status.coverage}
            {universeCount != null && ` · ${universeCount} companies loaded`}
            {status.missing.length > 0 && (
              <> · Optional keys not set: {status.missing.join(", ")}</>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Source({
  name,
  role,
  detail,
  ok,
}: {
  name: string;
  role: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{name}</p>
        {ok ? <Badge tone="good">Active</Badge> : <Badge>Needs key</Badge>}
      </div>
      <p className="mt-0.5 text-xs font-medium text-muted-strong">{role}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}
