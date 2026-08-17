import { fieldValue } from "@/lib/fundamentals/normalize";
import type { NormalizedFundamentals } from "@/lib/fundamentals/types";
import { money } from "@/lib/format";
import type { SectorKind } from "@/lib/scoring/applicability";
import { Card, CardHeader } from "@/components/ui";

/**
 * The balance sheet, explained without accounting vocabulary.
 *
 * A single proportional bar plus generated sentences. The aim is that someone
 * who has never opened a 10-K can see, in one glance, how much the company owns
 * against how much it owes and what is left over for shareholders.
 */
export function BalanceSheetVisual({
  fundamentals,
  sector,
  currency = "USD",
}: {
  fundamentals: NormalizedFundamentals;
  sector: SectorKind;
  /** The filer's own reporting currency; a Korean filer reports in won. */
  currency?: string;
}) {
  const period = fundamentals.annual[0];
  if (!period) return null;

  const assets = fieldValue(period, "assets");
  const liabilities = fieldValue(period, "liabilities");
  const equity = fieldValue(period, "equity");
  const cash = fieldValue(period, "cash");
  const ocf = fieldValue(period, "operatingCashFlow");
  const netIncome = fieldValue(period, "netIncome");

  if (assets == null || liabilities == null) return null;

  const liabPct = Math.max(0, Math.min(1, liabilities / assets));
  const equityPct = Math.max(0, 1 - liabPct);
  const coverage = liabilities !== 0 ? assets / liabilities : null;

  const sentences: string[] = [];
  if (coverage != null) {
    sentences.push(
      `For every $1 ${shortName(fundamentals.entityName)} owes, it owns $${coverage.toFixed(2)} in assets.`,
    );
  }
  if (equity != null && assets > 0) {
    sentences.push(
      `After paying off everything it owes, ${money(equity, currency)} would be left for shareholders — ` +
        `about ${Math.round(equityPct * 100)}% of everything it owns.`,
    );
  }
  if (cash != null) {
    // Cash runway is only meaningful when the business is burning cash.
    if (ocf != null && ocf < 0) {
      const months = Math.floor(cash / (Math.abs(ocf) / 12));
      sentences.push(
        `It holds ${money(cash, currency)} in cash. At its current rate of cash burn that would ` +
          `last roughly ${months} month${months === 1 ? "" : "s"} without new funding.`,
      );
    } else {
      sentences.push(`It holds ${money(cash, currency)} in cash and cash equivalents.`);
    }
  }
  if (sector === "financial") {
    sentences.push(
      "Because this is a financial company, most of what it 'owes' is customer deposits " +
        "and funding it lends back out. High leverage is normal here and does not mean the same " +
        "thing as it would for a manufacturer or retailer.",
    );
  }

  return (
    <Card>
      <CardHeader
        title="The balance sheet, in plain English"
        subtitle={`Figures from the FY${period.fiscalYear} annual filing`}
      />
      <div className="space-y-4 p-5">
        <div>
          <div
            className="flex h-11 w-full overflow-hidden rounded-lg"
            role="img"
            aria-label={`Of ${money(assets, currency)} in total assets, ${money(liabilities, currency)} is owed to others and ${money(equity, currency)} belongs to shareholders.`}
          >
            <div
              className="flex items-center justify-center bg-poor/75 text-xs font-medium text-white"
              style={{ width: `${liabPct * 100}%` }}
            >
              {liabPct > 0.14 && <span>Owes {money(liabilities, currency)}</span>}
            </div>
            <div
              className="flex items-center justify-center bg-good/75 text-xs font-medium text-white"
              style={{ width: `${equityPct * 100}%` }}
            >
              {equityPct > 0.14 && <span>Owns {money(equity, currency)}</span>}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-poor/75" />
              Liabilities {money(liabilities, currency)}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-good/75" />
              Shareholders&apos; equity {money(equity, currency)}
            </span>
            <span className="tnum font-medium text-muted-strong">
              Total assets {money(assets, currency)}
            </span>
          </div>
        </div>

        <ul className="space-y-2 text-sm leading-relaxed text-muted-strong">
          {sentences.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted" />
              <span>{s}</span>
            </li>
          ))}
        </ul>

        {netIncome != null && (
          <p className="border-t border-border pt-3 text-xs text-muted">
            Last year it {netIncome >= 0 ? "earned" : "lost"}{" "}
            <span className="font-medium text-foreground">{money(Math.abs(netIncome), currency)}</span>
            {ocf != null && (
              <>
                {" "}and generated{" "}
                <span className="font-medium text-foreground">{money(ocf, currency)}</span> of cash
                from operations
              </>
            )}
            .
          </p>
        )}
      </div>
    </Card>
  );
}

/** Trims legal suffixes so generated sentences read naturally. */
function shortName(name: string): string {
  return name
    .replace(/\b(inc|corp|corporation|company|co|ltd|limited|plc|holdings|group|sa|nv|ag)\b\.?/gi, "")
    .replace(/[,.]$/g, "")
    .trim();
}
