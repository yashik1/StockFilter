import Link from "next/link";
import { Card } from "@/components/ui";
import type { AssetClass, Instrument } from "@/lib/instruments";

/**
 * Says why there are no scores, for something that is not a company.
 *
 * The page already had two explanations for a missing health report — "this is
 * a fund" and "this files with a regulator we do not read" — and both are
 * wrong here in a way that reads as authoritative. Gold does not file with a
 * foreign regulator. Bitcoin is not a fund. Offering either would be a
 * confident false statement, which is worse than the empty card it replaced.
 *
 * So each class gets its own reason, and each says what the page *can* still
 * answer, because "no scores" is not the same as "nothing to see".
 */

interface Props {
  symbol: string;
  assetClass: AssetClass;
  instrument: Instrument | null;
}

function heading(assetClass: AssetClass, name: string): string {
  switch (assetClass) {
    case "crypto":
      return `${name} is a digital asset, not a company`;
    case "commodity":
      return `${name} is a physical commodity, not a company`;
    case "future":
      return `${name} is a futures contract, not a company`;
    default:
      return `${name} does not file financial statements`;
  }
}

function explain(assetClass: AssetClass, name: string, unit: string | undefined): string {
  switch (assetClass) {
    case "crypto":
      return (
        `${name} has no revenue, no balance sheet and no annual report, because there is ` +
        `no company behind it to produce one. The profitability, debt and accounting ` +
        `checks used elsewhere on this site read a business's own accounts, so there is ` +
        `nothing here for them to measure — its price is set entirely by what someone ` +
        `else will pay, with no earnings underneath it to compare that price against.`
      );
    case "commodity":
      return (
        `${name} is a raw material. It earns nothing, owes nothing and publishes no ` +
        `accounts, so every score on this site is inapplicable rather than missing. ` +
        `The price shown is the front-month futures contract${unit ? `, quoted ${unit}` : ""} — ` +
        `the standard way this market is priced, and not the same as what you would pay ` +
        `for a physical bar or barrel.`
      );
    case "future":
      return (
        `${name} is a standardised contract to buy or sell at a set date, not a share in ` +
        `a business. It has no accounts to score. Two things are worth knowing before ` +
        `reading the chart: futures are leveraged, so a small move in the price is a ` +
        `large move in a position, and the long-run series below is stitched together ` +
        `from successive contracts as each one expires. That makes it a research series ` +
        `rather than a record of something anybody could have simply bought and held.`
      );
    default:
      return `${name} publishes no financial statements, so the health scores do not apply.`;
  }
}

export function NotACompany({ symbol, assetClass, instrument }: Props) {
  const name = instrument?.name ?? symbol;

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">{heading(assetClass, name)}</h2>

      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">
        {explain(assetClass, name, instrument?.unit)}
      </p>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
        What still works:{" "}
        <span className="text-ink">price history</span> below,{" "}
        <Link
          href={`/backtest?symbol=${encodeURIComponent(symbol)}`}
          className="text-accent underline"
        >
          backtesting what an investment would have done
        </Link>
        , and{" "}
        <Link
          href={`/compare?symbols=${encodeURIComponent(symbol)},SPY`}
          className="text-accent underline"
        >
          comparing it against the wider market
        </Link>
        .
      </p>
    </Card>
  );
}
