import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, SectionHeading } from "@/components/ui";
import { getProvider } from "@/lib/providers";
import { price, signedPercent } from "@/lib/format";
import {
  COMMODITIES,
  CRYPTO,
  FUTURES,
  groupByCategory,
  type Instrument,
} from "@/lib/instruments";

/**
 * Prices move, but not so fast that a directory needs to be dynamic. Five
 * minutes keeps the headline strip current while collapsing every visitor in
 * that window onto one set of provider calls — which matters on a free tier
 * that allows eight requests a minute in total.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Crypto, commodities and futures",
  description:
    "Bitcoin, gold, oil, wheat and the index futures — price history and backtesting for " +
    "the markets that file no accounts.",
};

/**
 * The handful shown with a live price.
 *
 * Deliberately not all fifty-nine. Each quote is its own provider call, the
 * free tier allows eight a minute, and a page that fires sixty would rate-limit
 * itself into showing nothing at all — a directory of dashes is worse than a
 * directory that does not pretend. The rest carry their price on their own
 * page, one request at a time.
 */
const HEADLINE = ["BTC-USD", "ETH-USD", "GC=F", "SI=F", "CL=F", "ES=F"];

export default async function MarketsPage() {
  const quotes = await Promise.all(
    HEADLINE.map(async (symbol) => {
      const quote = await getProvider().getQuote(symbol).catch(() => null);
      return { symbol, quote };
    }),
  );

  return (
    <div className="space-y-5 pb-2">
      {/*
        The caveat sits in the head rather than in the small print at the
        bottom. Eleven of these quote in cents, and a reader who misses that
        reads a bushel of wheat as costing seven hundred dollars.
      */}
      <header className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-end gap-6 border-b border-border pt-10 pb-[22px]">
        <div>
          <p className="eyebrow mb-2">Crypto · metals · energy · agriculture · index futures</p>
          <h1 className="font-display mb-2 text-[2.75rem] leading-none">Markets</h1>
          <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
            None of these file accounts, so none of them get a health score. They get the
            chart, the comparison and the backtest — and this page says so rather than
            showing an empty panel.
          </p>
        </div>
        <p className="justify-self-start sm:justify-self-end">
          <Badge>Eleven agricultural contracts quote in US cents (USX)</Badge>
        </p>
      </header>

      {/* ---- live strip ---- */}
      <Card>
        <CardHeader
          title="Where things stand"
          subtitle="A few headline prices. Every instrument below has its own page."
        />
        <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
          {quotes.map(({ symbol, quote }) => (
            <Link
              key={symbol}
              href={`/stock/${encodeURIComponent(symbol)}`}
              className="bg-surface px-5 py-3 transition-colors hover:bg-surface-2"
            >
              <div className="text-xs font-semibold tracking-tight text-muted">
                {nameOf(symbol)}
              </div>
              <div className="tnum mt-1 text-[0.9375rem] font-semibold">
                {/* The quote's own currency, so a cents-quoted contract says cents. */}
                {price(quote?.price, quote?.currency ?? "USD")}
              </div>
              <div
                className={
                  "tnum text-xs " +
                  (quote?.changePercent == null
                    ? "text-faint"
                    : quote.changePercent >= 0
                      ? "text-good-fg"
                      : "text-poor-fg")
                }
              >
                {quote?.changePercent == null ? "—" : signedPercent(quote.changePercent)}
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <AssetSection
        eyebrow="Digital assets"
        title="Crypto"
        description="Trades every day of the year, weekends included. No accounts, no earnings — the price is whatever someone else will pay."
        instruments={CRYPTO}
      />

      <AssetSection
        eyebrow="Raw materials"
        title="Commodities"
        description="Quoted as the front-month futures contract. Watch the unit — eleven of these are priced in cents, not dollars."
        instruments={COMMODITIES}
      />

      <AssetSection
        eyebrow="Contracts"
        title="Financial futures"
        description="Stock indices, government bonds and currencies. Leveraged and dated — the long-run series is stitched across contracts as each expires."
        instruments={FUTURES}
      />

      <Card className="p-5">
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          Educational only, not investment advice. Prices here come from the same free data
          sources as the rest of the site and can be delayed or wrong. Commodities and futures
          are shown as continuous front-month series, which is a research convention rather
          than a record of any position somebody could have held — rolling from one contract
          to the next costs money that none of these figures include.
        </p>
      </Card>
    </div>
  );
}

function nameOf(symbol: string): string {
  return (
    [...CRYPTO, ...COMMODITIES, ...FUTURES].find((i) => i.symbol === symbol)?.name ?? symbol
  );
}

function AssetSection({
  eyebrow,
  title,
  description,
  instruments,
}: {
  eyebrow: string;
  title: string;
  description: string;
  instruments: Instrument[];
}) {
  const groups = groupByCategory(instruments);

  return (
    <section className="space-y-4">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} />

      {groups.map((group) => (
        <Card key={group.category}>
          <CardHeader title={group.category} subtitle={`${group.items.length} listed`} />
          <ul className="grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <li key={item.symbol}>
                <Link
                  href={`/stock/${encodeURIComponent(item.symbol)}`}
                  className="flex h-full items-baseline justify-between gap-3 bg-surface px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    {item.unit && (
                      <span className="block truncate text-xs text-faint">{item.unit}</span>
                    )}
                  </span>
                  <Badge>{item.symbol}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  );
}
