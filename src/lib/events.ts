import { secEdgar } from "./providers/sec-edgar";
import { yahoo } from "./providers/yahoo";
import type { CorporateEvent } from "./providers/types";

/**
 * What happened to the shares during a window, for marking on the chart.
 *
 * A price line on its own invites wrong conclusions, and the two worst are the
 * easiest to draw. A 10:1 split reads as a 90% collapse. A dividend reads as an
 * unexplained overnight drop. Neither is a fall in the value of the business,
 * and a newcomer has no way to tell that from the shape of the line.
 *
 * The three kinds come from two places, and only one of them needs a key:
 * dividends and splits ride along on the chart endpoint Yahoo already serves,
 * while results dates come from the dates the company filed its 10-Q and 10-K
 * with the SEC. That last one is the actual publication date of the figures,
 * which is exactly what the marker is claiming, rather than an estimate of when
 * a company might report.
 */

/**
 * Forms whose filing date is when a company published results.
 *
 * 6-K is deliberately absent. A foreign issuer files one for any material
 * event, not only for results, so counting them marked Shopify with 28 sets of
 * results in three years where there were twelve — and a marker that appears
 * when nothing was published is worse than no marker.
 */
const RESULTS_FORMS = new Set(["10-Q", "10-K", "20-F", "40-F"]);

export async function getCorporateEvents(
  symbol: string,
  from: Date,
  to: Date,
): Promise<CorporateEvent[]> {
  const [market, filings] = await Promise.all([
    yahoo.getCorporateEvents(symbol, from, to).catch(() => ({ dividends: [], splits: [] })),
    secEdgar.getFilings(symbol, 60).catch(() => []),
  ]);

  const events: CorporateEvent[] = [];

  for (const d of market.dividends) {
    events.push({
      kind: "dividend",
      time: d.time,
      label: formatAmount(d.amount),
      detail: `Paid a dividend of ${formatAmount(d.amount)} a share.`,
    });
  }

  for (const s of market.splits) {
    events.push({
      kind: "split",
      time: s.time,
      label: s.ratio,
      // The reassurance is the point: the drop in the line is arithmetic, not
      // a loss, and that is not obvious from looking at it.
      detail:
        `Split its shares ${s.ratio}. The price per share falls by that ratio ` +
        `while the value of a holding does not change.`,
    });
  }

  const fromSec = Math.floor(from.getTime() / 1000);
  const toSec = Math.floor(to.getTime() / 1000);

  for (const f of filings) {
    if (!RESULTS_FORMS.has(f.form)) continue;

    const time = Math.floor(Date.parse(f.filedAt) / 1000);
    if (!Number.isFinite(time) || time < fromSec || time > toSec) continue;

    events.push({
      kind: "earnings",
      time,
      label: "Results",
      detail:
        f.form === "10-Q"
          ? "Published quarterly results."
          : "Published annual results.",
    });
  }

  // A restated filing can appear twice on the same day; one marker is enough.
  const seen = new Set<string>();
  return events
    .filter((e) => {
      const key = `${e.kind}:${new Date(e.time * 1000).toISOString().slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

/** Dividends are small per-share amounts, so cents matter. */
function formatAmount(amount: number): string {
  return amount < 1 ? `${Math.round(amount * 100)}c` : `$${amount.toFixed(2)}`;
}
