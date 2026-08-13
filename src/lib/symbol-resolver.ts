import { loadTickerMap } from "./providers/sec-edgar";
import { searchGlobalSymbols } from "./providers/twelvedata";
import type { SymbolSearchResult } from "./providers/types";

/**
 * Works out what an unrecognised ticker actually is.
 *
 * Financial scores come from SEC filings, so a TSX-only listing such as ATZ
 * (Aritzia) has none and previously produced a bare "not found" that implied a
 * typo. The symbol exists — it just files with SEDAR+ in Canada, which has no
 * public API.
 *
 * Two things make a better answer possible without paying for data. The
 * worldwide symbol directory needs no API key, so the ticker can be identified
 * and its exchange named. And many foreign companies also list in the US under
 * a different ticker, which does file with the SEC — Canadian National Railway
 * is CNR in Toronto and CNI in New York. Finding that sibling turns a dead end
 * into a working page.
 */

export interface UnsupportedSymbol {
  symbol: string;
  /** Company name from the worldwide directory. */
  name: string | null;
  exchange: string | null;
  country: string | null;
  /** Other listings of the same company, worldwide. */
  otherListings: SymbolSearchResult[];
  /** A US-listed ticker for the same company that does file with the SEC. */
  usEquivalent: { symbol: string; name: string } | null;
}

/** Words that carry no identity when matching one company name to another. */
const NOISE =
  /\b(inc|incorporated|corp|corporation|co|company|companies|ltd|limited|plc|group|holdings?|the|and|of|sa|nv|ag|se|class|common|shares?|stock|adr|cda|canada)\b/gi;

function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(NOISE, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Scores how strongly two company names refer to the same business.
 * Returns the share of the shorter name's distinctive words that both share.
 */
function nameSimilarity(a: string, b: string): number {
  const left = nameTokens(a);
  const right = new Set(nameTokens(b));
  if (left.length === 0 || right.size === 0) return 0;

  const shared = left.filter((w) => right.has(w)).length;
  return shared / Math.min(left.length, right.size);
}

/**
 * Finds a US-listed ticker for a company named in a foreign listing.
 *
 * Matches on name because there is no shared identifier between the two
 * directories — the SEC knows CIKs, the symbol directory does not. The
 * threshold is deliberately high: suggesting the wrong company is worse than
 * suggesting none, since someone might act on it.
 */
export async function findUsEquivalent(
  companyName: string,
): Promise<{ symbol: string; name: string } | null> {
  if (!companyName.trim()) return null;

  const map = await loadTickerMap().catch(() => null);
  if (!map) return null;

  let best: { symbol: string; name: string; score: number } | null = null;

  for (const entry of map.values()) {
    const score = nameSimilarity(companyName, entry.title);
    if (score >= 0.75 && (!best || score > best.score)) {
      best = { symbol: entry.ticker.toUpperCase(), name: entry.title, score };
    }
  }

  return best ? { symbol: best.symbol, name: best.name } : null;
}

/**
 * Identifies a ticker that SEC EDGAR does not cover.
 *
 * Returns null when the symbol is unknown everywhere, which is the genuine
 * "you mistyped it" case and should be reported as such.
 */
export async function resolveUnsupported(symbol: string): Promise<UnsupportedSymbol | null> {
  const upper = symbol.toUpperCase();
  const matches = await searchGlobalSymbols(upper, 12);

  const exact = matches.filter((m) => m.symbol.toUpperCase() === upper);
  if (exact.length === 0) return null;

  // Prefer the primary listing over a secondary venue for the same company.
  const primary = exact[0];

  const usEquivalent = primary.name ? await findUsEquivalent(primary.name) : null;

  return {
    symbol: upper,
    name: primary.name ?? null,
    exchange: primary.exchange ?? null,
    country: primary.country ?? null,
    otherListings: exact
      .slice(1)
      .filter((m) => m.exchange && m.exchange !== primary.exchange),
    // Never point at the same ticker we already failed to find.
    usEquivalent:
      usEquivalent && usEquivalent.symbol !== upper ? usEquivalent : null,
  };
}
