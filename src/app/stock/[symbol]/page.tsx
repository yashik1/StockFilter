import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BalanceSheetVisual } from "@/components/stock/balance-sheet";
import { FundamentalsChart, type TrendSeries } from "@/components/stock/fundamentals-chart";
import { FilingsList, NewsList, PeersList, ResearchLinks } from "@/components/stock/links";
import { QuestionCard, QuestionSummary, VerdictCard } from "@/components/stock/verdict";
import { PriceChart } from "@/components/price-chart";
import { Badge, Card, CardHeader, Change, EmptyState, SectionHeading } from "@/components/ui";
import { money, price as fmtPrice } from "@/lib/format";
import { fieldValue } from "@/lib/fundamentals/normalize";
import type { PriceFreshness } from "@/lib/providers/types";
import { getStockPageData, yearlySeries } from "@/lib/stock-data";

export const revalidate = 900;

export async function generateMetadata({
  params,
}: PageProps<"/stock/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const upper = decodeURIComponent(symbol).toUpperCase();
  return {
    title: `${upper} — financial health in plain English`,
    description: `Is ${upper} profitable, growing, or carrying too much debt? Plain-English answers from its regulatory filings.`,
  };
}

/** Label explaining exactly how fresh a price is, so nothing is implied. */
const FRESHNESS: Record<PriceFreshness, { label: string; hint: string }> = {
  "realtime-iex": {
    label: "Real-time (IEX)",
    hint: "Live trades from the IEX exchange, which covers part of total US volume.",
  },
  "delayed-15min": {
    label: "15-min delayed",
    hint: "Consolidated market data, delayed 15 minutes.",
  },
  "end-of-day": { label: "End of day", hint: "Last closing price." },
  unknown: { label: "Delayed", hint: "Freshness unknown." },
};

export default async function StockPage({ params }: PageProps<"/stock/[symbol]">) {
  const { symbol } = await params;
  const upper = decodeURIComponent(symbol).toUpperCase();

  const data = await getStockPageData(upper);

  // Nothing at all resolved — the ticker does not exist in EDGAR.
  if (!data.profile && !data.fundamentals) notFound();

  const { profile, fundamentals, quote, report, sector, marketCap } = data;
  const latest = fundamentals?.annual[0];

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
            {profile?.exchange && <Badge>{profile.exchange}</Badge>}
            {profile?.country === "CA" && <Badge tone="accent">Canadian</Badge>}
            {sector === "financial" && (
              <Badge title="Some scoring models do not apply to financial companies.">
                Financial sector
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {profile?.name ?? fundamentals?.entityName}
            {profile?.industry && ` · ${profile.industry}`}
          </p>
        </div>

        <div className="text-right">
          {quote?.price != null ? (
            <>
              <p className="display text-3xl font-bold">{fmtPrice(quote.price)}</p>
              <div className="flex items-center justify-end gap-2">
                <Change value={quote.change} percent={quote.changePercent} />
                <Badge title={FRESHNESS[quote.freshness].hint}>
                  {FRESHNESS[quote.freshness].label}
                </Badge>
              </div>
            </>
          ) : (
            <Badge title="Add TWELVEDATA_API_KEY to show live prices.">
              Price unavailable
            </Badge>
          )}
          {marketCap != null && (
            <p className="mt-1 text-xs text-muted">Market value {money(marketCap)}</p>
          )}
        </div>
      </header>

      {/* ---- verdict ---- */}
      {report ? (
        <VerdictCard report={report} companyName={profile?.name ?? upper} />
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

      {/* ---- price chart ---- */}
      <Card>
        <CardHeader
          title="Price history"
          subtitle="Filter by minute, hour, day or week"
        />
        <div className="p-5">
          <PriceChart symbol={upper} />
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
          <NewsList news={data.news} symbol={upper} />
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
