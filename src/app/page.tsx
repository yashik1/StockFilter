import Link from "next/link";
import { TranslationHero } from "@/components/translation-hero";
import { WatchlistPanel } from "@/components/watchlist";
import { MarketOverview, MarketSetupHint } from "@/components/market-overview";
import { LocalTime } from "@/components/local-time";
import { getMarketSnapshot, hasMarketData } from "@/lib/market";
import { Badge, Card, RatingBadge } from "@/components/ui";
import { money, percent, price as fmtPrice, signedPercent } from "@/lib/format";
import { getProvider, providerStatus } from "@/lib/providers";
import type { Rating } from "@/lib/scoring/types";
import { getHealthiest, getUniverseCount } from "@/lib/screener";

export const dynamic = "force-dynamic";

function healthRating(score: number | null): Rating {
  if (score == null) return "unknown";
  if (score >= 7.5) return "good";
  if (score >= 5) return "fair";
  return "poor";
}

/**
 * The index strip's contents.
 *
 * Named for what they actually are rather than for the index they track. The
 * design called for "S&P 500" and a "10-yr yield", and this app has neither:
 * it has quotes. SPY is an ETF that tracks the S&P, and ZN is the note future,
 * whose price moves inversely to the yield and is not the yield. Labelling
 * them as the index and the yield would have been the sort of small
 * inaccuracy the rest of the product exists to avoid.
 */
const STRIP = [
  { symbol: "SPY", label: "S&P 500 (SPY)" },
  { symbol: "QQQ", label: "Nasdaq 100 (QQQ)" },
  { symbol: "ZN=F", label: "10-yr T-note" },
];

export default async function HomePage() {
  const [healthiest, universeCount, market, strip] = await Promise.all([
    getHealthiest(6),
    getUniverseCount(),
    getMarketSnapshot(5),
    // Fails soft, one cell at a time: a rate-limited quote should cost that
    // cell its figure, never the page.
    Promise.all(
      STRIP.map(async (s) => ({
        ...s,
        quote: await getProvider().getQuote(s.symbol).catch(() => null),
      })),
    ),
  ]);
  const status = providerStatus();

  return (
    <div>
      <TranslationHero />

      {/* ---- index strip ---- */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] border-b border-border">
        {strip.map(({ symbol, label, quote }) => (
          <div key={symbol} className="border-r border-border px-5 py-[18px] last:border-r-0">
            <p className="eyebrow mb-1.5">{label}</p>
            <p className="tnum font-display text-[1.625rem] leading-none">
              {fmtPrice(quote?.price, quote?.currency ?? "USD")}
            </p>
            <p
              className={`tnum mt-0.5 text-[0.8125rem] ${
                quote?.changePercent == null
                  ? "text-faint"
                  : quote.changePercent >= 0
                    ? "text-up"
                    : "text-down"
              }`}
            >
              {quote?.changePercent == null ? "—" : signedPercent(quote.changePercent)}
            </p>
          </div>
        ))}
        <div className="px-5 py-[18px]">
          <p className="eyebrow mb-1.5">Companies scored</p>
          <p className="tnum font-display text-[1.625rem] leading-none">
            {universeCount ?? "—"}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-faint">
            {market.asOf ? (
              <>
                refreshed <LocalTime value={market.asOf} mode="datetime" />
              </>
            ) : (
              "not refreshed yet"
            )}
          </p>
        </div>
      </div>

      <div className="space-y-11 pt-11">
        {hasMarketData(market) ? (
          <MarketOverview snapshot={market} />
        ) : (
          universeCount != null && universeCount > 0 && <MarketSetupHint />
        )}

        <WatchlistPanel />

        {/* ---- healthiest companies (needs the database) ---- */}
        <section aria-labelledby="healthiest-heading">
          <div className="mb-[18px] flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="eyebrow mb-1.5">Ranked from the filings</p>
              <h2 id="healthiest-heading" className="font-display text-[1.875rem]">
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

                    {/* A floor rather than a clamp, so the three figures below
                        sit on the same line across every card in the row. */}
                    <p className="mt-3 min-h-[2.8em] text-[0.8125rem] leading-relaxed text-muted">
                      {r.headline}
                    </p>

                    <dl className="mt-3.5 grid grid-cols-3 gap-2.5 border-t border-border pt-3">
                      <div>
                        <dt className="eyebrow mb-0.5 text-[0.625rem]">Value</dt>
                        <dd className="tnum text-[0.84375rem] font-bold">{money(r.marketCap)}</dd>
                      </div>
                      <div>
                        <dt className="eyebrow mb-0.5 text-[0.625rem]">Growth</dt>
                        <dd className="tnum text-[0.84375rem] font-bold">{percent(r.revenueGrowth)}</dd>
                      </div>
                      <div>
                        <dt className="eyebrow mb-0.5 text-[0.625rem]">Margin</dt>
                        <dd className="tnum text-[0.84375rem] font-bold">{percent(r.netMargin)}</dd>
                      </div>
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
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
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
          <p className="eyebrow mb-1.5">Provenance</p>
          <h2 id="sources-heading" className="font-display mb-[18px] text-[1.875rem]">
            Where the data comes from
          </h2>

          <div className="scroll-x">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="eyebrow py-2 pr-4 font-semibold">Source</th>
                  <th scope="col" className="eyebrow py-2 pr-4 font-semibold">Supplies</th>
                  <th scope="col" className="eyebrow py-2 pr-4 font-semibold">Why it</th>
                  <th scope="col" className="eyebrow py-2 font-semibold">Status</th>
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
                  supplies="OHLCV bars, quotes"
                  why="Free tier serves the full intraday range"
                  ok={status.charts}
                />
                <SourceRow
                  name="Finnhub"
                  supplies="News, logos, peers"
                  why="60 quote requests a minute, free"
                  ok={status.news}
                />
                <SourceRow
                  name="Yahoo Finance"
                  supplies="Price fallback, dividends, crypto and commodities"
                  why="Keyless, and the only source covering the non-company markets"
                  ok
                />
              </tbody>
            </table>
          </div>

          <p className="mt-3.5 max-w-2xl text-xs leading-relaxed text-muted">
            Coverage: {status.coverage}
            {universeCount != null && ` · ${universeCount} companies loaded`}
            {status.missing.length > 0 && (
              <> · Optional keys not set: {status.missing.join(", ")}</>
            )}
          </p>
        </section>
      </div>
    </div>
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
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2.5 pr-4 font-semibold">{name}</td>
      <td className="py-2.5 pr-4 text-muted">{supplies}</td>
      <td className="py-2.5 pr-4 text-muted">{why}</td>
      <td className="py-2.5">
        {ok ? <Badge tone="accent">Active</Badge> : <Badge>Needs key</Badge>}
      </td>
    </tr>
  );
}
