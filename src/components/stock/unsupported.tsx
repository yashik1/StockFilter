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

      <p className="mt-4 text-base leading-relaxed text-muted">
        This is a real company — it just doesn&apos;t file with the SEC. Financial
        scores here are built from SEC filings, and a company listed only on
        {exchange ? ` ${exchange}` : " a non-US exchange"} files with its own national
        regulator instead
        {country === "Canada" ? " (SEDAR+ in Canada, which has no public API)" : ""}.
      </p>

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

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-semibold">What would make this work</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Two options, and the first is free. Setting{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
            ENABLE_YAHOO_FALLBACK=true
          </code>{" "}
          turns on a worldwide fallback that covers this listing — it is off by default
          because Yahoo publishes no official API and restricts automated use, so
          whether that suits your deployment is a judgement call rather than a technical
          one.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          For a documented, licensed source instead, setting{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">EODHD_API_KEY</code>{" "}
          switches the whole app to 60+ exchanges with no other change.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href="/learn" className="text-sm text-accent hover:underline">
            Where the data comes from →
          </Link>
          <Link href="/terms" className="text-sm text-accent hover:underline">
            Terms covering each source →
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
