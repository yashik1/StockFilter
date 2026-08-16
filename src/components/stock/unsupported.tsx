import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import type { UnsupportedSymbol } from "@/lib/symbol-resolver";

/**
 * Shown for a ticker that exists but sits outside SEC coverage.
 *
 * The previous behaviour was a plain "not found", which told someone who had
 * typed a perfectly real ticker that they had probably misspelled it. This
 * names the company, says which exchange it trades on, explains why there are
 * no scores, and — when the same company also lists in the US — points at the
 * ticker that does work.
 */
/** US venues, where "it files abroad instead" would simply be untrue. */
const US_EXCHANGES = new Set([
  "NYSE",
  "NASDAQ",
  "NYSE ARCA",
  "NYSEARCA",
  "AMEX",
  "NYSE AMERICAN",
  "BATS",
  "CBOE",
  "IEX",
  "OTC",
]);

/**
 * Says why this particular listing has no analysis.
 *
 * There are three genuinely different reasons and they were previously
 * collapsed into one sentence about foreign regulators. That sentence was read
 * out to someone looking up a US-listed ETF, telling them a fund was a company
 * and that NYSE was outside the United States.
 */
function explain(info: UnsupportedSymbol): string {
  const { name, symbol, exchange, country, type } = info;
  const subject = name ?? symbol;
  const onUsVenue = exchange ? US_EXCHANGES.has(exchange.toUpperCase()) : false;

  if (type === "etf") {
    return (
      `${subject} is a fund — it holds a basket of other investments rather than ` +
      `running a business. The health scores here read a company's own annual ` +
      `accounts, and a fund files none, so there is nothing for them to measure.`
    );
  }

  if (onUsVenue) {
    return (
      `${subject} trades on ${exchange}, but no annual accounts for it could be ` +
      `found in the SEC's filing database. That is usually because it is newly ` +
      `listed, or files under a different name than it trades under.`
    );
  }

  return (
    `${subject} is a real company — it just reports to a different regulator. ` +
    `The analysis here is built from filings made to the US Securities and ` +
    `Exchange Commission, and a company listed on ` +
    `${exchange ?? "an exchange outside the US"} files with ` +
    `${country ? `${country}'s` : "its own"} authorities instead` +
    `${country === "Canada" ? ", on SEDAR+" : ""}.`
  );
}

export function UnsupportedListing({ info }: { info: UnsupportedSymbol }) {
  const { symbol, name, exchange, country, otherListings, usEquivalent } = info;

  return (
    <div className="mx-auto max-w-3xl py-10">
      <p className="eyebrow">Outside our coverage</p>
      <h1 className="font-display mt-3 text-4xl sm:text-5xl">
        {name ?? symbol}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{symbol}</Badge>
        {exchange && <Badge>{exchange}</Badge>}
        {country && <Badge>{country}</Badge>}
      </div>

      <p className="mt-4 text-base leading-relaxed text-muted">{explain(info)}</p>

      {/* The most useful thing on the page when it exists: the same company,
          under the ticker that does work here. */}
      {usEquivalent && (
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-border bg-accent-soft/40 px-5 py-3">
            <p className="text-sm font-semibold text-accent">
              Good news — the same company is listed in the US
            </p>
          </div>
          <Link
            href={`/stock/${encodeURIComponent(usEquivalent.symbol)}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
          >
            <div className="min-w-0">
              <p className="text-lg font-bold tracking-tight">{usEquivalent.symbol}</p>
              <p className="truncate text-sm text-muted">{usEquivalent.name}</p>
              <p className="mt-1 text-xs text-muted">
                Files with the SEC, so the full analysis works.
              </p>
            </div>
            <ArrowRight aria-hidden className="size-5 shrink-0 text-accent" />
          </Link>
        </Card>
      )}

      {otherListings.length > 0 && (
        <Card className="mt-4 p-5">
          <div className="flex items-center gap-2">
            <Globe aria-hidden className="size-4 text-muted" />
            <h2 className="text-sm font-semibold">Also trades on</h2>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {otherListings.map((l, i) => (
              <span
                key={`${l.exchange}-${i}`}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-strong"
              >
                {l.exchange}
                {l.country && <span className="ml-1.5 text-faint">{l.country}</span>}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/*
        This card used to give instructions for setting ENABLE_YAHOO_FALLBACK
        and EODHD_API_KEY. Those are deployment settings: a reader cannot act on
        them, they name internals on a public page, and the advice was offered
        even where it would not have helped — a fund has no accounts to fetch
        from any source. What a reader can actually do is look elsewhere, so
        that is what is offered.
      */}
      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold">What you can still do</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {info.type === "etf" ? (
            <>
              Judge a fund by what it holds and how it has performed, rather than by
              company accounts.{" "}
              <Link
                href={`/compare?symbols=${encodeURIComponent(symbol)},SPY`}
                className="text-accent underline"
              >
                Compare it against the wider market
              </Link>{" "}
              to see how it has done.
            </>
          ) : (
            <>
              Read the company&apos;s own reports on its investor relations pages, which
              is where the figures here would have come from.{" "}
              <Link href="/screen" className="text-accent underline">
                The screener
              </Link>{" "}
              covers everything that does file with the SEC.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/learn" className="text-sm text-accent hover:underline">
            Which companies are covered →
          </Link>
        </div>
      </Card>

      <div className="mt-8">
        <p className="mb-2 text-sm text-muted">Look up something else:</p>
        <SearchBox />
      </div>
    </div>
  );
}
