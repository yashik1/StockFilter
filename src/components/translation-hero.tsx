import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SearchBox } from "@/components/search-box";

/**
 * The hero shows the product doing its job rather than describing it.
 *
 * On the left, what a filing actually looks like: XBRL concept names and raw
 * figures, which is genuinely what arrives from SEC EDGAR. On the right, the
 * sentence this app writes from exactly those three numbers. The claim is
 * "we translate this into that", so showing both halves argues it better than
 * any list of features.
 *
 * The figures are Apple's real FY2025 balance sheet, and the sentence is the
 * one the live scoring engine produces — not a mockup.
 */
export function TranslationHero() {
  return (
    <section className="pt-10 sm:pt-16">
      <p className="eyebrow">Company filings, in plain English</p>

      <h1 className="font-display mt-4 max-w-[18ch] text-[2.5rem] sm:text-6xl">
        Annual reports are written to be filed, not read.
      </h1>

      <p className="prose-measure mt-5 text-lg leading-relaxed text-muted-strong">
        StockFilter reads them for you and answers the five questions that
        actually matter — in sentences, with a link to every source.
      </p>

      <div className="mt-8 max-w-xl">
        <SearchBox />
      </div>

      {/* The demonstration */}
      <div className="mt-12 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
        {/* Before: what the filing gives you */}
        <figure className="m-0 rounded-[var(--radius)] border border-border bg-surface-2/50 p-5">
          <figcaption className="eyebrow mb-4 flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-faint" aria-hidden />
            What the filing says
          </figcaption>

          <dl className="space-y-2.5 text-[0.8125rem]">
            {[
              ["us-gaap:Assets", "359,240,000,000"],
              ["us-gaap:Liabilities", "285,510,000,000"],
              ["us-gaap:StockholdersEquity", "73,730,000,000"],
            ].map(([tag, value]) => (
              <div
                key={tag}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border/60 pb-2 last:border-0"
              >
                <dt className="font-data text-muted">{tag}</dt>
                <dd className="font-data tabular-nums text-muted-strong">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-faint">
            Apple&apos;s FY2025 balance sheet, exactly as tagged in its filing.
          </p>
        </figure>

        {/* The turn */}
        <div
          aria-hidden
          className="flex items-center justify-center py-1 lg:py-0"
        >
          <span className="flex size-8 items-center justify-center rounded-full border border-border bg-surface text-accent">
            <ArrowRight className="size-4 lg:rotate-0" />
          </span>
        </div>

        {/* After: what we say */}
        <figure className="m-0 rounded-[var(--radius)] border border-accent/25 bg-accent-soft/40 p-5 shadow-[var(--shadow-sm)]">
          <figcaption className="eyebrow mb-4 flex items-center gap-2 text-accent">
            <span className="inline-block size-1.5 rounded-full bg-accent" aria-hidden />
            What it means
          </figcaption>

          <p className="font-display text-2xl leading-snug sm:text-[1.75rem]">
            For every $1 Apple owes, it owns{" "}
            <span className="tnum text-accent">$1.26</span> in assets.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-muted-strong">
            After paying off everything it owes,{" "}
            <span className="tnum">$73.73B</span> would be left for
            shareholders — about a fifth of everything it owns.
          </p>

          <Link
            href="/stock/AAPL"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            See the full analysis for Apple
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </figure>
      </div>
    </section>
  );
}
