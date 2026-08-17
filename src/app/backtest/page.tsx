import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, EmptyState, Metric } from "@/components/ui";
import { EquityChart } from "@/components/backtest/equity-chart";
import { LocalTime } from "@/components/local-time";
import { runSingleStockBacktest, DEFAULT_BENCHMARK } from "@/lib/backtest/run";
import { isInvestmentError, type InvestmentResult } from "@/lib/backtest/single-stock";
import { money, signedPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "What if I had invested…",
  description:
    "See what an investment in any stock would be worth today, next to the market as a whole.",
};

const SUGGESTIONS = [
  { label: "AAPL since 2015", symbol: "AAPL", start: "2015-01-01" },
  { label: "MSFT since 2018", symbol: "MSFT", start: "2018-01-01" },
  { label: "SPY since 2010", symbol: "SPY", start: "2010-01-01" },
];

function suggestionHref(s: (typeof SUGGESTIONS)[number]) {
  return `/backtest?symbol=${s.symbol}&start=${s.start}&amount=10000`;
}

export default async function BacktestPage({ searchParams }: PageProps<"/backtest">) {
  const params = await searchParams;
  const symbol = typeof params.symbol === "string" ? params.symbol.trim().toUpperCase() : "";
  const start = typeof params.start === "string" ? params.start : "";
  const amountParam = typeof params.amount === "string" ? Number(params.amount) : 10_000;
  const amount = Number.isFinite(amountParam) && amountParam > 0 ? amountParam : 10_000;
  const reinvest = params.reinvest !== "cash";
  const benchmarkParam = typeof params.benchmark === "string" ? params.benchmark.trim() : "";
  const benchmark =
    benchmarkParam === "none" ? null : benchmarkParam || DEFAULT_BENCHMARK;

  const hasQuery = Boolean(symbol && start);
  const startDate = hasQuery ? new Date(start) : null;
  const validDate = startDate && !Number.isNaN(startDate.getTime());

  const backtest =
    hasQuery && validDate
      ? await runSingleStockBacktest(symbol, startDate!, amount, reinvest, benchmark)
      : null;

  return (
    <div className="space-y-5">
      <header className="pt-1">
        <p className="eyebrow">What if</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">What if I had invested…</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Pick a stock, a date and an amount. This shows what that money would be worth
          today, using the actual price history — nothing here is a prediction about what
          happens next.
        </p>
      </header>

      <Card>
        <form method="get" className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <div>
            <label htmlFor="symbol" className="text-xs text-muted">
              Ticker
            </label>
            <input
              id="symbol"
              name="symbol"
              defaultValue={symbol}
              placeholder="AAPL"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm uppercase placeholder:normal-case placeholder:text-muted/60"
            />
          </div>
          <div>
            <label htmlFor="start" className="text-xs text-muted">
              Invested on
            </label>
            <input
              id="start"
              name="start"
              type="date"
              defaultValue={start}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="amount" className="text-xs text-muted">
              Amount
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              min={1}
              step="any"
              defaultValue={amount}
              className="tnum mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="reinvest" className="text-xs text-muted">
              Dividends
            </label>
            {/*
              A checkbox only appears in the submitted query string when it is
              checked, so reading "was it unchecked" from a GET form is
              genuinely ambiguous — and a hidden field sharing the checkbox's
              name does not fix that, it just submits the name twice, which
              Next.js hands back as an array rather than a single value. A
              select always submits exactly one of two named values, so there
              is nothing to get wrong.
            */}
            <select
              id="reinvest"
              name="reinvest"
              defaultValue={reinvest ? "reinvest" : "cash"}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="reinvest">Reinvested</option>
              <option value="cash">Paid out as cash</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-fit self-end rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Run
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <span className="text-xs text-muted">Try:</span>
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.label}
              href={suggestionHref(s)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </Card>

      {!hasQuery ? (
        <Card>
          <EmptyState
            title="Nothing to show yet"
            description="Enter a ticker and a date above, or pick one of the suggestions."
          />
        </Card>
      ) : !validDate ? (
        <Card>
          <EmptyState title="That date didn't parse" description="Pick a date and try again." />
        </Card>
      ) : (
        <BacktestResults backtest={backtest!} amount={amount} reinvest={reinvest} />
      )}

      <Card className="p-5">
        <p className="text-xs leading-relaxed text-muted">
          Educational only, not investment advice. This uses real historical prices and, where
          available, real dividend payments — but it assumes a lump sum invested on one day and
          held without ever selling, which is rarely how anyone actually invests. No fees,
          spreads or taxes are modelled, and no correction is made for surviving to be listed
          today — a company that failed along the way would not appear here to be picked at all.
        </p>
      </Card>
    </div>
  );
}

function BacktestResults({
  backtest,
  amount,
  reinvest,
}: {
  backtest: Awaited<ReturnType<typeof runSingleStockBacktest>>;
  amount: number;
  reinvest: boolean;
}) {
  const { result, benchmark } = backtest;

  if (isInvestmentError(result)) {
    return (
      <Card>
        <EmptyState title="Couldn't run that one" description={result.error} />
      </Card>
    );
  }

  const benchResult = benchmark && !isInvestmentError(benchmark.result) ? benchmark.result : null;
  const benchError = benchmark && isInvestmentError(benchmark.result) ? benchmark.result.error : null;

  return (
    <div className="space-y-4">
      {result.startedLate && (
        <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-strong">
          {backtest.symbol} has no price history back to your chosen date — this starts from{" "}
          <LocalTime value={result.startTime * 1000} mode="date" /> instead, its earliest
          available price.
        </p>
      )}
      {reinvest && !backtest.dividendDataAvailable && (
        <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-strong">
          Dividend data isn&apos;t available on this deployment, so this shows price return only
          — any dividends {backtest.symbol} paid are not included.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ResultCard label={backtest.symbol} amount={amount} result={result} reinvest={reinvest} />
        {benchmark && benchResult && (
          <ResultCard
            label={benchmark.symbol}
            amount={amount}
            result={benchResult}
            reinvest={reinvest}
            isBenchmark
          />
        )}
        {benchmark && benchError && (
          <Card>
            <EmptyState
              title={`No benchmark data for ${benchmark.symbol}`}
              description={benchError}
            />
          </Card>
        )}
      </div>

      <Card>
        <CardHeader
          title="Value over time"
          subtitle={
            benchResult
              ? `${backtest.symbol} against ${benchmark!.symbol}, both starting from the same ${money(amount)}`
              : `${backtest.symbol} alone`
          }
        />
        <div className="p-5">
          <EquityChart
            target={{ label: backtest.symbol, series: result.series }}
            benchmark={benchResult ? { label: benchmark!.symbol, series: benchResult.series } : null}
          />
        </div>
      </Card>
    </div>
  );
}

function ResultCard({
  label,
  amount,
  result,
  reinvest,
  isBenchmark,
}: {
  label: string;
  amount: number;
  result: InvestmentResult;
  reinvest: boolean;
  isBenchmark?: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={label}
        subtitle={
          <>
            <LocalTime value={result.startTime * 1000} mode="date" /> —{" "}
            <LocalTime value={result.endTime * 1000} mode="date" />
            {isBenchmark && " · benchmark"}
          </>
        }
      />
      <dl className="grid grid-cols-3 gap-4 p-5">
        <Metric
          label="Would be worth"
          value={money(result.finalValue)}
          hint={`Starting from ${money(amount)}.`}
          size="lg"
          tone={result.totalReturn >= 0 ? "up" : "down"}
        />
        <Metric
          label="Total return"
          value={signedPercent(result.totalReturn, 1)}
          hint="Change in value over the whole period."
          tone={result.totalReturn >= 0 ? "up" : "down"}
        />
        <Metric
          label="Yearly average"
          value={result.cagr == null ? "—" : signedPercent(result.cagr, 1)}
          hint={
            result.cagr == null
              ? "The period is too short to annualise meaningfully."
              : "Annualised — the steady yearly rate that would produce the same result."
          }
        />
      </dl>
      {reinvest && result.dividendsReceived === 0 && result.totalReturn !== 0 && (
        <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
          Dividends, if any, were reinvested into more shares rather than paid out as cash.
        </p>
      )}
      {!reinvest && result.dividendsReceived > 0 && (
        <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
          Includes {money(result.dividendsReceived)} in dividends collected as cash, not
          reinvested.
        </p>
      )}
    </Card>
  );
}
