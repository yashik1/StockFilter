import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "./db";
import { companies } from "./db/schema";
import { findInstrument } from "./instruments";
import { nameForSymbol } from "./providers/sec-edgar";

/**
 * The display name for a symbol, cheaply enough to use in a page title.
 *
 * `generateMetadata` runs before the page body streams, so anything it awaits
 * delays the whole document head — which is exactly what the Suspense
 * boundary on the stock page exists to avoid. That rules out calling
 * getStockPageData here, and rules in the three sources below, none of which
 * costs a new network round trip on a page that renders anyway.
 *
 * Tiers, best-cased first:
 *
 *  1. The instrument catalogue — hand-written, so "Bitcoin" rather than
 *     "BTC-USD".
 *  2. The companies table — one indexed lookup on an already-open pool. These
 *     names come from EDGAR's submissions endpoint, which cases them far
 *     better than the ticker map does, and they cover the several hundred
 *     pages with the most to gain from being findable.
 *  3. The SEC ticker map, de-shouted — memoised for the life of the process
 *     and already loaded by the existence check on this route, so it is free
 *     here. Covers the long tail the ingest has never touched.
 *
 * Returns null rather than the ticker when nothing resolves, so the caller
 * decides what an unnamed page should be called.
 */
export async function displayName(symbol: string): Promise<string | null> {
  const upper = symbol.toUpperCase();

  const instrument = findInstrument(upper);
  if (instrument) return instrument.name;

  if (isDatabaseConfigured()) {
    try {
      const [row] = await getDb()
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.symbol, upper))
        .limit(1);
      if (row?.name) return row.name;
    } catch {
      // A page title is not worth failing a page over.
    }
  }

  return nameForSymbol(upper).catch(() => null);
}
