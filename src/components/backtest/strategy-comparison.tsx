import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { money, num, percent, signedPercent } from "@/lib/format";
import type { StrategyResult } from "@/lib/backtest/strategies";
import { MIN_TRADES_FOR_CONFIDENCE, type OrbResult } from "@/lib/backtest/opening-range";

/**
 * What several textbook trading rules would have done with the same money.
 *
 * The comparison only means anything against a baseline, so buy-and-hold is a
 * row rather than an assumption — the honest question is never "did this rule
 * make money" but "did it do better than doing nothing", and a rule that
 * traded a hundred times to finish behind a single purchase is the most
 * useful thing this table can show.
 */

export function StrategyComparison({
  symbol,
  results,
  amount,
}: {
  symbol: string;
  results: StrategyResult[];
  amount: number;
}) {
  if (results.length === 0) {
    return (
      <Card>
        <CardHeader title="Trading strategies" />
        <EmptyState
          title="Not enough history"
          description={`There is not enough daily price history for ${symbol} to run these rules over.`}
        />
      </Card>
    );
  }

  const baseline = results.find((r) => r.id === "buy-and-hold") ?? null;
  const beat = baseline
    ? results.filter((r) => r.id !== "buy-and-hold" && r.finalValue > baseline.finalValue).length
    : 0;
  const challengers = results.length - (baseline ? 1 : 0);

  return (
    <Card>
      <CardHeader
        title="If you had traded it by a rule instead"
        subtitle={`The same ${money(amount)}, run through five well-known rules over the last ten years of daily prices`}
      />

      {baseline && (
        <p className="border-b border-border bg-surface-2/40 px-5 py-3 text-xs leading-relaxed text-muted-strong">
          {beat === 0 ? (
            <>
              None of the {challengers} rules beat simply buying {symbol} and holding it. That is
              the usual result, and the reason this table shows holding as a row rather than
              assuming it.
            </>
          ) : (
            <>
              {beat} of {challengers} rules finished ahead of simply buying {symbol} and holding
              it — over this window, on this stock, which is a much narrower claim than the rule
              being good.
            </>
          )}
        </p>
      )}

      <div className="scroll-x">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/50 text-left text-xs text-muted">
              <th scope="col" className="px-5 py-2.5 font-medium">Rule</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Would be worth</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Yearly average</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Worst fall</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Trades</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Win rate</th>
              {/* The column that stops a win rate being read as an edge: a rule
                  can win seven times in ten and still lose money if the three
                  losses are large. Same figure, same code, as the journal. */}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Profit factor</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Invested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.map((r) => {
              const isBaseline = r.id === "buy-and-hold";
              const aheadOfBaseline = baseline != null && !isBaseline && r.finalValue > baseline.finalValue;

              return (
                <tr key={r.id} className={isBaseline ? "bg-surface-2/30" : undefined}>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{r.name}</span>
                      {isBaseline && <Badge>baseline</Badge>}
                      {aheadOfBaseline && <Badge tone="good">ahead of holding</Badge>}
                    </div>
                    <p className="mt-0.5 max-w-md text-xs text-muted">{r.rule}</p>
                  </td>
                  <td className="tnum px-3 py-3 text-right align-top">{money(r.finalValue)}</td>
                  <td
                    className={`tnum px-3 py-3 text-right align-top font-medium ${
                      (r.cagr ?? 0) >= 0 ? "text-good-fg" : "text-poor-fg"
                    }`}
                  >
                    {r.cagr == null ? "—" : signedPercent(r.cagr, 1)}
                  </td>
                  {/*
                    Shown as a positive magnitude with a "down" colour rather
                    than a negative number: it is a depth, not a return, and
                    signing it invites it to be read as part of the total.
                  */}
                  <td className="tnum px-3 py-3 text-right align-top text-poor-fg">
                    {percent(r.maxDrawdown, 1)}
                  </td>
                  <td className="tnum px-3 py-3 text-right align-top">
                    {/* Buy-and-hold never sells, so it has no completed round
                        trip — a dash rather than a misleading zero. */}
                    {isBaseline ? "—" : r.trades}
                  </td>
                  <td className="tnum px-3 py-3 text-right align-top">
                    {r.winRate == null ? "—" : percent(r.winRate, 0)}
                  </td>
                  <td className="tnum px-3 py-3 text-right align-top">
                    {isBaseline || r.pnl.profitFactor == null ? (
                      "—"
                    ) : (
                      <span className={r.pnl.profitFactor >= 1 ? "text-good-fg" : "text-poor-fg"}>
                        {num(r.pnl.profitFactor, 2)}
                      </span>
                    )}
                  </td>
                  <td className="tnum px-5 py-3 text-right align-top text-muted">
                    {percent(r.timeInMarket, 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        The rule and its padding stay on the outer block so the divider spans
        the card; the text is capped inside it. Run at the full width these
        footnotes reached about 200 characters a line, which is where a reader
        starts losing the return to the next line — and these are the
        paragraphs saying what the numbers above do not account for.
      */}
      <div className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted">
        <div className="max-w-2xl space-y-2">
          <p>
            <span className="font-medium text-ink">Read the win rate alongside the return.</span>{" "}
            A rule can be right most of the time and still finish behind, because it wins small
            and loses big, or because it sits in cash through the rise that mattered — the
            &ldquo;invested&rdquo; column is how much of the decade it was actually holding
            anything.
          </p>
          <p>
            These are price returns with no dividends, so that the only difference between rows
            is the rule itself rather than which one happened to be holding on a pay date. No
            fees, spreads, slippage or taxes are modelled, and a rule that trades often would pay
            all four. Every rule is long-or-flat — never short — and uses its conventional
            textbook settings, left untuned on purpose: a rule adjusted until it looks good on
            the ten years being shown will always look good on those ten years.
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * The opening-range breakout, kept separate from the daily rules.
 *
 * Not a stylistic choice — it is a different test on different data over a
 * different window, and putting it in the same table would invite a reader to
 * compare a sixty-session intraday result against a ten-year daily one as
 * though the two numbers were the same kind of thing.
 */
export function OpeningRangeCard({
  symbol,
  run,
  amount,
}: {
  symbol: string;
  run: { source: string | null; rangeMinutes: number; result: OrbResult; error?: string };
  amount: number;
}) {
  const { result, rangeMinutes } = run;
  const thin = result.trades.length < MIN_TRADES_FOR_CONFIDENCE;

  return (
    <Card>
      <CardHeader
        title="Opening range breakout"
        subtitle={`Trading the first break of each day's first ${rangeMinutes} minutes, closing before the bell`}
      />

      {run.error || result.sessionsTested === 0 ? (
        <EmptyState
          title="No intraday history available"
          description={
            run.error ??
            `Minute-by-minute prices for ${symbol} could not be loaded, and this rule cannot be tested without them.`
          }
        />
      ) : (
        <>
          {/*
            The sample size leads, above the numbers rather than beneath them.

            A win rate over forty trades has an error bar wide enough to cover
            both "edge" and "coin toss", and printing it first as a headline
            figure would let it be read as a measurement. Free intraday data
            runs about sixty days; there is no version of this with a
            ten-year sample behind it.
          */}
          {thin && (
            <p className="border-b border-border bg-fair-soft px-5 py-3 text-xs leading-relaxed text-muted-strong">
              <span className="font-medium text-ink">
                {result.trades.length} trades is far too few to conclude anything.
              </span>{" "}
              This rule is intraday, and free minute-by-minute history only reaches back about
              two months — where the daily rules above get ten years. Treat what follows as an
              illustration of how the rule behaves, not as evidence that it works or does not.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Stat label="Sessions tested" value={String(result.sessionsTested)} />
            <Stat
              label="Win rate"
              value={result.winRate == null ? "—" : percent(result.winRate, 0)}
            />
            <Stat
              label="Best / worst day"
              value={
                result.bestTrade == null || result.worstTrade == null
                  ? "—"
                  : `${signedPercent(result.bestTrade, 1)} / ${signedPercent(result.worstTrade, 1)}`
              }
            />
            <Stat
              label="Compounded"
              value={signedPercent(result.totalReturn, 1)}
              tone={result.totalReturn >= 0 ? "up" : "down"}
              hint={`From ${money(amount)} at full size on every signal.`}
            />
          </dl>

          <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted">
            Each day, the high and low of the first {rangeMinutes} minutes form a range. The
            first break of it is taken — long above, short below — and closed at the last price
            of the session, so nothing is ever held overnight. Entries are priced at the range
            edge that triggered them, which assumes a fill there; in practice a fast break can
            fill worse. {result.sessionsWithoutBreakout} of {result.sessionsTested} sessions
            never left the opening range, so no trade was taken on{" "}
            {result.sessionsWithoutBreakout === 1 ? "that day" : "those days"}. Shorting is
            included here because the rule is defined symmetrically, and it carries borrow costs
            and margin requirements this does not model.
          </p>
        </>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`tnum mt-0.5 text-lg font-semibold ${
          tone === "up" ? "text-good-fg" : tone === "down" ? "text-poor-fg" : ""
        }`}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}
