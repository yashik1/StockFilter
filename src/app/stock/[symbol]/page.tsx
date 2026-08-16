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
import { Badge, Card, CardHeader, EmptyState, SectionHeading } from "@/components/ui";
import { fieldValue } from "@/lib/fundamentals/normalize";
import { getStockPageData, yearlySeries } from "@/lib/stock-data";
import { Suspense } from "react";
import { StockSkeleton } from "@/components/stock/skeleton";
import { UnsupportedListing } from "@/components/stock/unsupported";
import { resolveUnsupported, type UnsupportedSymbol } from "@/lib/symbol-resolver";
import { cikForSymbol } from "@/lib/providers/sec-edgar";

export const revalidate = 900;

export async function generateMetadata({
  params,
}: PageProps<"/stock/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const upper = decodeURIComponent(symbol).toUpperCase();

  const title = `${upper} — financial health in plain English`;
  const description = `Is ${upper} profitable, growing, or carrying too much debt? Plain-English answers from its regulatory filings.`;

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

  const cik = await cikForSymbol(upper).catch(() => null);

  // Absent from EDGAR. Resolve it here, before streaming, so a genuine typo can
  // still answer 404 — but do not decide the page from that alone. A fallback
  // provider may hold statements for this company, and short-circuiting to the
  // coverage explainer here meant the fallback was never asked.
  let unsupported: UnsupportedSymbol | null = null;
  if (!cik) {
    unsupported = await resolveUnsupported(upper).catch(() => null);
    if (!unsupported) notFound();
  }

  return (
    <Suspense fallback={<StockSkeleton />}>
      <StockBody symbol={upper} unsupported={unsupported} />
    </Suspense>
  );
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

  // Orientation before analysis: what the business is, then what the filings
  // show going well and going badly.
  const currency = data.reportingCurrency ?? "USD";
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
      {/* ---- header ---- */}
      <header className="flex flex-wrap items-start justify-between gap-4 pt-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="display text-3xl font-bold sm:text-4xl">{upper}</h1>
            {(profile?.exchange ?? unsupported?.exchange) && (
              <Badge>{profile?.exchange ?? unsupported?.exchange}</Badge>
            )}
            {(profile?.country === "CA" || unsupported?.country === "Canada") && (
              <Badge tone="accent">Canadian</Badge>
            )}
            {sector === "financial" && (
              <Badge title="Some scoring models do not apply to financial companies.">
                Financial sector
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {profile?.name ?? unsupported?.name ?? fundamentals?.entityName}
            {profile?.industry && ` · ${profile.industry}`}
            {!profile && unsupported?.country && ` · ${unsupported.country}`}
          </p>
        </div>

        <WatchButton
          symbol={upper}
          name={profile?.name ?? unsupported?.name ?? fundamentals?.entityName}
        />
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
          quote={quote}
          marketCap={marketCap}
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
          <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
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
          <BalanceSheetVisual fundamentals={fundamentals} sector={sector} />
        )}
        <Card>
          <CardHeader
            title="How it has changed over time"
            subtitle="Reported annual figures"
          />
          <FundamentalsChart series={trends} />
        </Card>
      </div>

      {/* ---- sources ---- */}
      <SectionHeading
        eyebrow="Go deeper"
        title="Sources and further reading"
        description="Every figure above traces back to one of these filings."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <FilingsList filings={data.filings} />
        <div className="space-y-4">
          <NewsList
            news={data.news}
            symbol={upper}
            status={data.newsStatus}
            source={data.newsSource}
          />
          <PeersList peers={data.peers} />
          <ResearchLinks
            symbol={upper}
            cik={profile?.cik ?? null}
            website={profile?.website ?? null}
          />
        </div>
      </div>

      {/* ---- provenance ---- */}
      {latest && (
        <p className="text-xs text-muted">
          Financial figures are from {upper}&apos;s {latest.form} for fiscal year{" "}
          {latest.fiscalYear} (period ending {latest.end}), reported under the{" "}
          {fundamentals?.taxonomy === "ifrs-full" ? "IFRS" : "US GAAP"} taxonomy.
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
