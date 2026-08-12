import Link from "next/link";
import { ArrowRight, FileSearch, ListFilter, Sparkles } from "lucide-react";
import { SearchBox } from "@/components/search-box";
import { Badge, Card, CardHeader, RatingBadge } from "@/components/ui";
import { money, percent } from "@/lib/format";
import { providerStatus } from "@/lib/providers";
import type { Rating } from "@/lib/scoring/types";
import { getHealthiest, getUniverseCount } from "@/lib/screener";

export const dynamic = "force-dynamic";

/** Well-known tickers so a first-time visitor has somewhere to click. */
const EXAMPLES = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "Nvidia" },
  { symbol: "RY", name: "Royal Bank of Canada" },
  { symbol: "SHOP", name: "Shopify" },
  { symbol: "KO", name: "Coca-Cola" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "ENB", name: "Enbridge" },
];

const STEPS = [
  {
    icon: FileSearch,
    title: "Read the filings so you don't have to",
    body:
      "Every figure comes straight from a company's official annual report on SEC EDGAR — not a summary, not a scraped estimate.",
  },
  {
    icon: Sparkles,
    title: "Turn the numbers into sentences",
    body:
      "Instead of a debt-to-equity ratio, you get: “For every $1 it owes, it owns $1.80 in assets.”",
  },
  {
    icon: ListFilter,
    title: "Compare hundreds at once",
    body:
      "The screener filters companies on financial health, so you can find sound businesses without reading a single balance sheet.",
  },
];

function healthRating(score: number | null): Rating {
  if (score == null) return "unknown";
  if (score >= 7.5) return "good";
  if (score >= 5) return "fair";
  return "poor";
}

export default async function HomePage() {
  const [healthiest, universeCount] = await Promise.all([
    getHealthiest(6),
    getUniverseCount(),
  ]);
  const status = providerStatus();

  return (
    <div className="space-y-10">
      {/* ---- hero ---- */}
      <section className="pt-8 text-center sm:pt-12">
        <p className="eyebrow">Plain-English company research</p>
        <h1 className="display mx-auto mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">
          Understand any company without reading a balance sheet
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
          StockFilter reads a company&apos;s official filings and tells you, in plain
          English, whether it makes money, whether it&apos;s growing, and whether it owes
          more than it can handle — with a link to every source.
        </p>

        <div className="mx-auto mt-7 max-w-xl">
          <SearchBox />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted">Try:</span>
          {EXAMPLES.map((e) => (
            <Link
              key={e.symbol}
              href={`/stock/${e.symbol}`}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              {e.symbol}
              <span className="ml-1.5 font-normal text-muted">{e.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="sr-only">
          How it works
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.title} className="p-5" interactive>
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-accent-soft">
                <s.icon aria-hidden className="size-4.5 text-accent" />
              </span>
              <h3 className="mt-3 text-[0.9375rem] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

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
