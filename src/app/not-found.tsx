import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { Card } from "@/components/ui";

/**
 * Shown when a ticker or page does not exist.
 *
 * Mistyping a ticker is the single most common way a newcomer lands here, so
 * this offers a search box and a few real companies to click rather than a bare
 * "404 — not found" dead end.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-14 text-center">
      <p className="eyebrow">Nothing here</p>
      <h1 className="display mt-3 text-3xl font-bold sm:text-4xl">
        We couldn&apos;t find that one
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted">
        That ticker isn&apos;t in the SEC&apos;s records — it may be misspelled, or the
        company may not file with US regulators. Search by company name below; you
        don&apos;t need to know the ticker.
      </p>

      <div className="mx-auto mt-7 max-w-md">
        <SearchBox autoFocus />
      </div>

      <div className="mt-8">
        <p className="text-xs text-muted">Or start with one of these:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {[
            { symbol: "AAPL", name: "Apple" },
            { symbol: "MSFT", name: "Microsoft" },
            { symbol: "RY", name: "Royal Bank" },
            { symbol: "SPY", name: "S&P 500 fund" },
          ].map((s) => (
            <Link
              key={s.symbol}
              href={`/stock/${s.symbol}`}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              {s.symbol}
              <span className="ml-1.5 font-normal text-muted">{s.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <Card className="mt-9 p-5 text-left">
        <h2 className="text-sm font-semibold">Why some companies are missing</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Financial data comes from SEC filings, which covers US-listed companies plus
          Canadian ones that also list in the US. A company listed only on the TSX, LSE
          or another exchange won&apos;t appear — and most ETFs file no financial
          statements at all, so they show price history only.
        </p>
        <Link href="/learn" className="mt-3 inline-block text-sm text-accent hover:underline">
          More about where the data comes from →
        </Link>
      </Card>
    </div>
  );
}
