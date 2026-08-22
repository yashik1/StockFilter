import { getProvider } from "./providers";

/**
 * The three market gauges shown across the top of the dashboard.
 *
 * Deliberately a fixed, tiny list. This is orientation — "what kind of day is
 * it" — before a reader looks at anything specific, and it earns three
 * requests rather than a configurable dashboard's worth.
 *
 * Every one fails soft to null. A gauge is context, not the product; a page
 * that could not render because a broad-market quote was unavailable would be
 * failing at the wrong thing entirely.
 */

export interface IndexReading {
  label: string;
  symbol: string;
  value: number | null;
  changePercent: number | null;
  /** Rates move in points, not percent — a yield "up 0.42%" reads as a level. */
  format: "index" | "rate";
}

const GAUGES: { label: string; symbol: string; format: IndexReading["format"] }[] = [
  { label: "S&P 500", symbol: "^GSPC", format: "index" },
  { label: "Nasdaq 100", symbol: "^IXIC", format: "index" },
  { label: "10-yr yield", symbol: "^TNX", format: "rate" },
];

export async function getIndexStrip(): Promise<IndexReading[]> {
  return Promise.all(
    GAUGES.map(async ({ label, symbol, format }) => {
      const quote = await getProvider().getQuote(symbol).catch(() => null);
      return {
        label,
        symbol,
        value: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null,
        format,
      };
    }),
  );
}
