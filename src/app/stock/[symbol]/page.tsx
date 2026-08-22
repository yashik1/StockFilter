import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BalanceSheetVisual } from "@/components/stock/balance-sheet";
import { FundamentalsChart, type TrendSeries } from "@/components/stock/fundamentals-chart";
import { FilingsList, NewsList, PeersList, ResearchLinks } from "@/components/stock/links";
import { QuestionCard, QuestionSummary, VerdictCard } from "@/components/stock/verdict";
import { PricePanel } from "@/components/stock/peer-chart";
import { RecordVisit, WatchButton } from "@/components/watchlist";
import { StrengthsAndRisks, WhatItDoes } from "@/components/stock/orientation";
import { buildBusinessSummary } from "@/lib/scoring/business";
import { buildHighlights } from "@/lib/scoring/highlights";
import { Badge, Card, CardHeader, EmptyState, RatingBadge, SectionHeading } from "@/components/ui";
import { fieldValue } from "@/lib/fundamentals/normalize";
import { money, price as fmtPrice, signedPercent } from "@/lib/format";
import { getStockPageData, yearlySeries } from "@/lib/stock-data";
import { Suspense } from "react";
import { StockSkeleton } from "@/components/stock/skeleton";
import { UnsupportedListing } from "@/components/stock/unsupported";
import { resolveUnsupported, type UnsupportedSymbol } from "@/lib/symbol-resolver";
import { cikForSymbol } from "@/lib/providers/sec-edgar";
import { ASSET_CLASS_LABEL, classify, findInstrument } from "@/lib/instruments";
import { NotACompany } from "@/components/stock/not-a-company";
import { EarlySignals } from "@/components/stock/early-signals";

export const revalidate = 900;

/**
 * How fresh a price is, as a word.
 *
 * Sits beside the figure rather than in a badge: a reader scanning the change
 * needs to know it is fifteen minutes old at the same moment they read it,
 * and a word survives greyscale and a screen reader where a coloured pill
 * does not.
 */
const FRESHNESS_WORD: Record<string, string> = {
  "realtime-iex": "live",
  "delayed-15min": "delayed 15 min",
  "end-of-day": "at close",
  unknown: "timing unknown",
};

export async function generateMetadata({
  params,
}: PageProps<"/stock/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const upper = decodeURIComponent(symbol).toUpperCase();

  // A commodity or a coin gets a title that describes what the page actually
  // offers. "Is gold profitable, growing, or carrying too much debt" is not a
  // question anybody asked, and it is the description search engines would show.
  const instrument = findInstrument(upper);
  const title = instrument
    ? `${instrument.name} (${upper}) — price history and backtesting`
    : `${upper} — financial health in plain English`;
  const description = instrument
    ? `Live price, long-run history and backtesting for ${instrument.name}. It files no accounts, so the company health scores do not apply.`
    : `Is ${upper} profitable, growing, or carrying too much debt? Plain-English answers from its regulatory filings.`;

  return {
    title,
    description,
    openGraph: { title: `${title} · StockFilter`, description, type: "article" },
    twitter: { card: "summary", title: `${title} · StockFilter`, description },
  };
}

/**
 * Resolves the ticker before anything streams, then hands off.
 *
 * The existence check has to happen outside the Suspense boundary: once
 * streaming begins the response status is already committed, and a notFound()
 * after that renders the right page under a 200. The lookup itself is cheap —
 * the EDGAR ticker map is memoised for the life of the process.
 */
export default async function StockPage({ params }: PageProps<"/stock/[symbol]">) {
  const { symbol } = await params;
  const upper = decodeURIComponent(symbol).toUpperCase();

  /*
    Commodities, contracts and coins skip the EDGAR existence check entirely.

    Not an optimisation — a correctness fix. That check asks whether the SEC
    has heard of the ticker and answers 404 when it has not, which is right for
    a mistyped equity and wrong for gold: BTC-USD and GC=F are absent from
    EDGAR by nature, and both used to 404 despite having decades of price
    history one call away.
  */
  const assetClass = classify(upper);

  let unsupported: UnsupportedSymbol | null = null;
  if (!assetClass) {
    const cik = await cikForSymbol(upper).catch(() => null);

    // Absent from EDGAR. Resolve it here, before streaming, so a genuine typo
    // can still answer 404 — but do not decide the page from that alone. A
    // fallback provider may hold statements for this company, and
    // short-circuiting to the coverage explainer here meant the fallback was
    // never asked.
    if (!cik) {
      unsupported = await resolveUnsupported(upper).catch(() => null);
      if (!unsupported) notFound();
    }
  }

  return (
    <Suspense
      fallback={<StockSkeleton label={assetClass ? "Loading price history…" : undefined} />}
    >
      <StockBody symbol={upper} unsupported={unsupported} />
    </Suspense>
  );
}

/** Rates span tiny and large numbers, so the useful precision varies. */
function formatRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(0);
  if (rate >= 1) return rate.toFixed(2);
  if (rate >= 0.01) return rate.toFixed(4);
  return rate.toPrecision(3);
}

/** The slow half: filings, prices and news. Streams behind the skeleton. */
async function StockBody({
  symbol: upper,
  unsupported,
}: {
  symbol: string;
  unsupported: UnsupportedSymbol | null;
}) {
  const data = await getStockPageData(upper);

  // The coverage explainer is a last resort, for when there is genuinely
  // nothing to show. Absence from EDGAR alone is not that: a US-listed fund is
  // missing from it by nature, and Roundhill Memory ETF was turned away with an
  // apology about foreign regulators while a perfectly good price history sat
  // one call away. If a price can be drawn, the ordinary page is the better
  // answer — it already explains a fund on its own terms.
  const hasSomethingToShow = Boolean(data.fundamentals?.annual.length || data.quote);
  if (unsupported && !hasSomethingToShow) {
    return <UnsupportedListing info={unsupported} />;
  }

  const { profile, fundamentals, quote, report, sector, marketCap } = data;
  const latest = fundamentals?.annual[0];

  /*
    Whether the accounts-shaped parts of the page apply at all.

    Without this, a Bitcoin page carried an empty "Reported annual figures"
    panel and a filings list apologising that "this company has no recent
    filings indexed on EDGAR" — both of which imply a company that ought to
    have filed and has not, rather than an asset that never could. An empty
    section is not neutral; it makes a claim about what is missing.
  */
  const filesAccounts = data.assetClass === "equity" || data.assetClass === "etf";

  // Orientation before analysis: what the business is, then what the filings
  // show going well and going badly.
  const currency = data.displayCurrency;
  const business = buildBusinessSummary(
    profile?.name ?? unsupported?.name ?? fundamentals?.entityName ?? upper,
    profile?.sicCode,
    fundamentals,
    currency,
  );
  const highlights =
    fundamentals && report ? buildHighlights(fundamentals, report, sector, currency) : null;

  const trends: TrendSeries[] = [
    { key: "revenue", label: "Revenue", data: yearlySeries(fundamentals, "revenue"), format: "money", kind: "bar" },
    { key: "netIncome", label: "Profit", data: yearlySeries(fundamentals, "netIncome"), format: "money", kind: "bar" },
    { key: "operatingCashFlow", label: "Cash flow", data: yearlySeries(fundamentals, "operatingCashFlow"), format: "money", kind: "bar" },
    { key: "assets", label: "Total assets", data: yearlySeries(fundamentals, "assets"), format: "money", kind: "line" },
    { key: "liabilities", label: "Total debt", data: yearlySeries(fundamentals, "liabilities"), format: "money", kind: "line" },
    { key: "equity", label: "Shareholder equity", data: yearlySeries(fundamentals, "equity"), format: "money", kind: "line" },
  ];

  return (
    <div className="space-y-5">
      {/*
        The head answers "what am I looking at, and what is it worth" before
        anything else on the page.

        The company's name carries the h1 and the ticker sits beside it, which
        is the way round a reader thinks: the symbol is an identifier, the name
        is the subject. The price moved here from the verdict card, where it
        sat next to a health score computed from an annual filing — two
        figures on utterly different clocks, presented as a pair.
      */}
      <header className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-end gap-6 border-b border-border pt-10 pb-[22px]">
        <div className="min-w-0">
          <p className="eyebrow mb-2">
            {[
              profile?.exchange ?? unsupported?.exchange,
              data.instrument ? ASSET_CLASS_LABEL[data.assetClass] : profile?.industry,
              profile?.cik ? `CIK ${profile.cik}` : null,
              data.instrument?.unit,
            ]
              .filter(Boolean)
              .join(" · ") || "Company filing"}
          </p>

          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
            <h1 className="font-display text-[2.75rem] leading-none">
              {data.instrument?.name ??
                profile?.name ??
                unsupported?.name ??
                fundamentals?.entityName ??
                upper}
            </h1>
            <span className="text-[1.1875rem] font-bold tracking-[0.06em] text-muted">
              {upper}
            </span>
            {report?.score != null && (
              <RatingBadge
                rating={report.score >= 7.5 ? "good" : report.score >= 5 ? "fair" : "poor"}
                label={`Health ${report.score.toFixed(1)} / 10`}
              />
            )}
            {sector === "financial" && (
              <Badge title="Some scoring models do not apply to financial companies.">
                Financial sector
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-start gap-x-6 gap-y-3 sm:justify-end">
          {quote?.price != null && (
            <div className="text-left sm:text-right">
              <p className="tnum font-display text-[2.375rem] leading-none">
                {fmtPrice(quote.price, currency)}
              </p>
              <p
                className={`tnum mt-0.5 text-[0.84375rem] ${
                  (quote.changePercent ?? 0) >= 0 ? "text-up" : "text-down"
                }`}
              >
                {signedPercent(quote.changePercent)}
                {/* The word, not just a badge: "delayed" has to survive being
                    read aloud and being seen in greyscale. */}
                <span className="text-muted"> · {FRESHNESS_WORD[quote.freshness]}</span>
              </p>
              {/* Market value follows the price rather than the health score.
                  It is the price multiplied by the share count, so it belongs
                  to the same clock as the figure above it. */}
              {marketCap != null && (
                <p className="tnum mt-0.5 text-xs text-faint">
                  {money(marketCap)} market value
                </p>
              )}
            </div>
          )}
          <WatchButton
            symbol={upper}
            name={profile?.name ?? unsupported?.name ?? fundamentals?.entityName}
          />
        </div>
      </header>

      <RecordVisit
        symbol={upper}
        name={profile?.name ?? unsupported?.name ?? fundamentals?.entityName}
      />

      {business && <WhatItDoes summary={business} />}

      {/* ---- verdict ---- */}
      {report ? (
        <VerdictCard
          report={report}
          companyName={profile?.name ?? unsupported?.name ?? upper}
        />
      ) : data.assetClass === "crypto" ||
        data.assetClass === "commodity" ||
        data.assetClass === "future" ? (
        <NotACompany
          symbol={upper}
          assetClass={data.assetClass}
          instrument={data.instrument}
        />
      ) : data.instrumentType === "etf" ? (
        // A fund holds other assets rather than running a business, so there is
        // no balance sheet to score. Saying that plainly is more useful than an
        // empty card implying the data merely failed to load.
        <Card className="p-5">
          <h2 className="text-base font-semibold">This is a fund, not a company</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            {profile?.name ?? upper} is an ETF or trust — a basket of other holdings. It has
            no revenue, no balance sheet and files no annual report, so the profitability,
            debt and accounting scores used for companies have nothing to measure here.
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Price history below still applies, and{" "}
            <Link
              href={`/compare?symbols=${encodeURIComponent(upper)},SPY`}
              className="text-accent underline"
            >
              comparing its performance
            </Link>{" "}
            against other funds or the wider market is a meaningful way to judge it.
          </p>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="No financial data available"
            description={`${upper} has no XBRL financial statements in SEC EDGAR. This usually means it is not a US or Canadian cross-listed filer.`}
          />
        </Card>
      )}

      {highlights && <StrengthsAndRisks highlights={highlights} />}

      {/* ---- price chart ---- */}
      <Card>
        <CardHeader
          title="Price history"
          subtitle={
            data.peers.length > 0
              ? "Filter by minute, hour, day or week — or compare against peers"
              : "Filter by minute, hour, day or week"
          }
        />
        <div className="p-5">
          <PricePanel symbol={upper} peers={data.peers} />
        </div>
      </Card>

      {/* ---- the five questions ---- */}
      {report && (
        <section aria-labelledby="questions-heading">
          <SectionHeading
            eyebrow="The essentials"
            title="The five questions that matter"
            description="Each answered from the filings, with the numbers behind it."
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-4 md:grid-cols-2">
              {report.questions.map((q) => (
                <QuestionCard key={q.key} question={q} />
              ))}
            </div>
            <div className="xl:sticky xl:top-20 xl:self-start">
              <QuestionSummary questions={report.questions} />
            </div>
          </div>
        </section>
      )}

      {/* ---- balance sheet + trends ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        {fundamentals && (
          <BalanceSheetVisual fundamentals={fundamentals} sector={sector} currency={currency} />
        )}
        {filesAccounts && (
          <Card>
            <CardHeader
              title="How it has changed over time"
              subtitle="Reported annual figures"
            />
            <FundamentalsChart series={trends} currency={currency} />
          </Card>
        )}
      </div>

      {/*
        Early signals — insider trades, pending sales, ownership stakes, a
        projected calendar. Equity only, not funds: an ETF's trust has
        officers of its own on file, but their trading activity is not the
        thing a reader of a fund page is here to learn about.
      */}
      {data.assetClass === "equity" && (
        <EarlySignals
          symbol={upper}
          insider={data.earlySignals.insider}
          stakes={data.earlySignals.stakes}
          upcoming={data.earlySignals.upcoming}
        />
      )}

      {/* ---- sources ---- */}
      <SectionHeading
        eyebrow="Go deeper"
        title={filesAccounts ? "Sources and further reading" : "News and further reading"}
        description={
          filesAccounts
            ? "Every figure above traces back to one of these filings."
            : "There are no filings to trace back to, but the market still gets written about."
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {filesAccounts && <FilingsList filings={data.filings} />}
        <div className="space-y-4">
          <NewsList
            news={data.news}
            symbol={upper}
            status={data.newsStatus}
            source={data.newsSource}
          />
          {filesAccounts && <PeersList peers={data.peers} />}
          {filesAccounts && (
            <ResearchLinks
              symbol={upper}
              cik={profile?.cik ?? null}
              website={profile?.website ?? null}
            />
          )}
        </div>
      </div>

      {/* ---- provenance ---- */}
      {latest && (
        <p className="text-xs text-muted">
          Financial figures are from {upper}&apos;s {latest.form} for fiscal year{" "}
          {latest.fiscalYear} (period ending {latest.end}), reported under the{" "}
          {fundamentals?.taxonomy === "ifrs-full" ? "IFRS" : "US GAAP"} taxonomy.
          {data.converted && (
            <>
              {" "}
              Reported in {data.converted.from} and shown here in{" "}
              {data.displayCurrency}, the currency {upper} trades in, converted at
              today&apos;s rate of {formatRate(data.converted.rate)}. The filing itself
              is in {data.converted.from}.
            </>
          )}
          {report?.sourceFilingUrl && (
            <>
              {" "}
              <a
                className="underline hover:text-foreground"
                href={report.sourceFilingUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                View the source filing
              </a>
              .
            </>
          )}
          {fundamentals && fieldValue(latest, "liabilities") != null &&
            latest.facts.liabilities?.derived && (
              <> Total liabilities were not tagged directly and were calculated as assets minus equity.</>
            )}
        </p>
      )}
    </div>
  );
}
