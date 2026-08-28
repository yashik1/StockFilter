import { Card, CardHeader, Metric } from "@/components/ui";
import type { ImpliedExpectations } from "@/lib/scoring/expectations";
import { money, percent } from "@/lib/format";

/**
 * What the price is already assuming, next to what the company has done.
 *
 * The two numbers are the entire panel, and they are deliberately left sitting
 * beside each other without a conclusion drawn. Whether a price demanding 15% a
 * year from a company that has managed 6% is too high depends on things no
 * filing contains — and saying so would be the first time this app told a
 * reader what to think about a price. It reports the gap; the reader decides
 * what it means.
 *
 * The words "fair value", "overvalued" and "undervalued" are absent on purpose.
 * Every one of them asserts that the market is wrong, which is a prediction
 * wearing the clothes of a measurement.
 */

/** Growth rates are shown whole. See the note in the caveat line below. */
const PLACES = 0;

function rateSentence(value: number, places = PLACES): string {
  return `${value < 0 ? "shrink" : "grow"} by about ${percent(Math.abs(value), places)} a year`;
}

export function ImpliedGrowth({
  expectations: e,
  currency,
}: {
  expectations: ImpliedExpectations;
  currency: string;
}) {
  const past =
    e.actualGrowth == null
      ? null
      : `Over the last ${e.actualYears} years it ${
          e.actualGrowth < 0 ? "shrank" : "grew"
        } by about ${percent(Math.abs(e.actualGrowth), PLACES)} a year.`;

  return (
    <Card>
      <CardHeader
        title="What the price assumes"
        subtitle="The growth rate someone buying today is paying for, against what the company has delivered"
      />

      <p className="max-w-3xl px-5 pt-4 text-[0.9375rem] leading-relaxed text-muted-strong">
        At today&apos;s price, the market is paying for free cash flow to{" "}
        <span className="font-semibold text-foreground">{rateSentence(e.impliedGrowth)}</span> for
        the next {e.horizonYears} years.{" "}
        {past ?? (
          <>
            Its free cash flow was negative earlier in this period, so there is no past growth
            rate to set against that.
          </>
        )}
      </p>

      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-border bg-surface-2/40 px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Growth the price assumes"
          value={percent(e.impliedGrowth, PLACES)}
          hint={`Solved from the price rather than forecast. Between ${percent(
            e.growthLow,
            PLACES,
          )} and ${percent(e.growthHigh, PLACES)} depending on the discount rate used.`}
          size="sm"
        />
        <Metric
          label={e.actualYears > 0 ? `Delivered over ${e.actualYears} years` : "Delivered"}
          value={e.actualGrowth == null ? "—" : percent(e.actualGrowth, PLACES)}
          hint="How fast free cash flow has actually grown, annualised over the longest run of positive years on file. Blank when an earlier year was negative, because growth from a negative base means nothing."
          size="sm"
        />
        <Metric
          label={`Free cash flow, FY${e.fiscalYear}`}
          value={money(e.baseFreeCashFlow, currency)}
          hint="Cash from operations after capital spending, taken from the latest annual filing. Every figure above is built on this one."
          size="sm"
        />
        <Metric
          label="What the business costs"
          value={money(e.enterpriseValue, currency)}
          hint="Enterprise value: the market value of the shares plus debt, less cash — what a buyer would pay for the whole business rather than for one share of it."
          size="sm"
        />
      </dl>

      {/*
        The assumptions, stated rather than buried. This figure moves a long way
        on the discount rate, so naming the rate and showing the band it
        produces is the difference between a calculation a reader can weigh and
        a number they have to take on trust. The rate is shown whole for the
        same reason: a tenth of a percent would be false precision on something
        this sensitive.
      */}
      <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-faint">
        Discounted at {percent(e.discountLow, PLACES)}–{percent(e.discountHigh, PLACES)} a year,
        with growth settling to {percent(e.terminalGrowth, 1)} after {e.horizonYears} years. Those
        rates are ordinary choices, not measurements: across that range the assumed growth works
        out between {percent(e.growthLow, PLACES)} and {percent(e.growthHigh, PLACES)}. This
        describes what the price implies — it is not a forecast, and not a view on whether the
        price is right.
      </p>
    </Card>
  );
}
