import type { NormalizedFundamentals } from "../fundamentals/types";
import { eodhd } from "./eodhd";
import { finnhub } from "./finnhub";
import { cikForSymbol, secEdgar } from "./sec-edgar";
import { tiingo } from "./tiingo";
import { yahoo } from "./yahoo";
import { searchGlobalSymbols, twelveData } from "./twelvedata";
import {
  fetchBarsWithFailover,
  fetchQuoteWithFailover,
  type PriceSource,
} from "./failover";
import type {
  Bar,
  CompanyProfile,
  Filing,
  InstrumentType,
  MarketDataProvider,
  NewsItem,
  Quote,
  SymbolSearchResult,
  Timeframe,
} from "./types";

/**
 * Composes the free US/Canada stack into a single provider.
 *
 * No one free source covers everything, so each job goes to the source that
 * does it best at zero cost:
 *   fundamentals + filings + sector -> SEC EDGAR   (authoritative, no key, no cap)
 *   price bars + quotes             -> Twelve Data (full intraday range, free)
 *   news + logo + peers             -> Finnhub     (free tier covers these)
 *
 * Anything unavailable degrades to empty rather than throwing, so a missing
 * optional key never takes down a page.
 */
class FreeStackProvider implements MarketDataProvider {
  readonly name = "SEC EDGAR + Twelve Data + Finnhub";

  /** EDGAR alone needs no credentials, so fundamentals always work. */
  isConfigured(): boolean {
    return true;
  }

  async getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]> {
    return (await getBarsWithSource(symbol, timeframe, from, to)).bars;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const result = await fetchQuoteWithFailover(PRICE_SOURCES, symbol);
    return result.value;
  }

  /**
   * Merges both profile sources. EDGAR supplies the SIC code that drives sector
   * gating in the scoring engine; Finnhub supplies the logo, market cap and
   * industry label. EDGAR wins on identity fields because it is authoritative.
   */
  async getProfile(symbol: string): Promise<CompanyProfile | null> {
    const [sec, fin] = await Promise.all([
      secEdgar.getProfile(symbol).catch(() => null),
      finnhub.isConfigured() ? finnhub.getProfile(symbol).catch(() => null) : null,
    ]);

    if (!sec && !fin) return null;

    return {
      symbol: symbol.toUpperCase(),
      name: sec?.name ?? fin?.name ?? symbol,
      exchange: fin?.exchange ?? sec?.exchange ?? null,
      country: fin?.country ?? sec?.country ?? null,
      currency: fin?.currency ?? null,
      sicCode: sec?.sicCode ?? null,
      sicDescription: sec?.sicDescription ?? null,
      industry: fin?.industry ?? sec?.sicDescription ?? null,
      website: fin?.website ?? null,
      logo: fin?.logo ?? null,
      marketCap: fin?.marketCap ?? null,
      sharesOutstanding: fin?.sharesOutstanding ?? null,
      cik: sec?.cik ?? null,
      description: fin?.description ?? null,
      entityType: sec?.entityType ?? null,
    };
  }

  async getFundamentals(symbol: string): Promise<NormalizedFundamentals | null> {
    return secEdgar.getFundamentals(symbol);
  }

  async getNews(symbol: string, limit?: number): Promise<NewsItem[]> {
    if (!finnhub.isConfigured()) return [];
    return finnhub.getNews(symbol, limit).catch(() => []);
  }

  async getFilings(symbol: string, limit?: number): Promise<Filing[]> {
    return secEdgar.getFilings(symbol, limit).catch(() => []);
  }

  /**
   * Searches EDGAR first, then tops up from Twelve Data.
   *
   * EDGAR only lists SEC registrants, so most ETFs are simply absent from it —
   * VTI, VOO, IWM and ARKK cannot be found there at all. Without the second
   * source those symbols would be unreachable through search.
   */
  /**
   * Searches EDGAR first, then tops up from the worldwide directory.
   *
   * The second lookup needs no API key, so it always runs. Without it a real
   * ticker on a foreign exchange — ATZ on the TSX, say — returns nothing at all
   * and reads as a typo. Those results are flagged unsupported rather than
   * hidden, because knowing the company exists and why it is unavailable beats
   * silence.
   */
  async searchSymbols(query: string, limit = 10): Promise<SymbolSearchResult[]> {
    const fromEdgar = await secEdgar.searchSymbols(query, limit).catch(() => []);

    // Only skip the worldwide lookup when EDGAR already holds this exact
    // ticker. Skipping merely because EDGAR filled the page would hide a
    // foreign listing behind loose name matches — searching a TSX ticker can
    // return eight unrelated US companies whose names happen to contain it.
    const q = query.trim().toUpperCase();
    const edgarHasExact = fromEdgar.some((r) => r.symbol.toUpperCase() === q);
    if (edgarHasExact) {
      return fromEdgar
        .map((r) => ({ ...r, supported: true, type: r.type ?? ("stock" as const) }))
        .slice(0, limit);
    }

    const seen = new Set(fromEdgar.map((r) => r.symbol.toUpperCase()));
    const worldwide = await searchGlobalSymbols(query, limit).catch(
      () => [] as SymbolSearchResult[],
    );

    const merged = [
      ...fromEdgar.map((r) => ({ ...r, supported: true, type: r.type ?? ("stock" as const) })),
      ...worldwide
        .filter((r) => !seen.has(r.symbol.toUpperCase()))
        .map((r) => ({ ...r, supported: false })),
    ];

    // Rank by how well the symbol itself matches, then prefer results we can
    // actually score. Without this an EDGAR name-substring hit outranks an
    // exact ticker match from the worldwide directory — searching "ATZ" put
    // "DATZ WORLD HOLDINGS" above Aritzia.
    const rank = (r: SymbolSearchResult) => {
      const sym = r.symbol.toUpperCase();
      if (sym === q) return 0;
      if (sym.startsWith(q)) return 1;
      return 2;
    };

    return merged
      .sort((a, b) => rank(a) - rank(b) || Number(b.supported) - Number(a.supported))
      .slice(0, limit);
  }

  /**
   * Classifies a symbol as an operating company or a fund.
   *
   * Resolving in EDGAR with usable XBRL data is the strongest signal of an
   * operating company. Funds file no statements — `companyfacts` returns 404
   * for SPY — so anything without them is checked against the market data
   * provider before being reported as unknown.
   */
  async getInstrumentType(symbol: string): Promise<InstrumentType> {
    if (twelveData.isConfigured()) {
      const type = await twelveData.getInstrumentType(symbol).catch(() => "unknown" as const);
      if (type !== "unknown") return type;
    }
    const cik = await cikForSymbol(symbol).catch(() => null);
    return cik ? "stock" : "unknown";
  }

  async getPeers(symbol: string): Promise<string[]> {
    if (!finnhub.isConfigured()) return [];
    return finnhub.getPeers(symbol).catch(() => []);
  }
}

/**
 * Price providers in preference order.
 *
 * Twelve Data leads because it is the only free source covering the full
 * intraday range. Finnhub follows for quotes — its 60 requests/minute is far
 * more headroom than Twelve Data's 8, and its key is already needed for news.
 * Tiingo backs up daily and weekly history, where its limits are counted per
 * hour rather than per minute.
 *
 * Yahoo sits last and only runs when explicitly enabled, because it has no
 * official API and its terms restrict automated use — see yahoo.ts. When it is
 * enabled it is the only one of these that covers non-US exchanges for free.
 */
const PRICE_SOURCES: PriceSource[] = [twelveData, finnhub, tiingo, yahoo];

/**
 * Bars plus the name of the provider that supplied them.
 *
 * Which provider answered is not a detail: they disagree. A ticker can name
 * different securities on different exchanges, so a chart is only interpretable
 * alongside where it came from — the same principle as linking every figure on
 * a company page back to its filing.
 */
export async function getBarsWithSource(
  symbol: string,
  timeframe: Timeframe,
  from: Date,
  to: Date,
): Promise<{ bars: Bar[]; source: string | null }> {
  const result = await fetchBarsWithFailover(PRICE_SOURCES, symbol, timeframe, from, to);
  if (result.value.length === 0 && result.attempts.length > 0) {
    // Every provider failed. Report why rather than returning an empty chart,
    // which reads as "this symbol has no history".
    throw new Error(describeFailure(result.attempts));
  }
  return { bars: result.value, source: result.source };
}

/** Summarises a total failure across every provider. */
function describeFailure(attempts: { provider: string; error: string }[]): string {
  const detail = attempts.map((a) => `${a.provider}: ${a.error}`).join("; ");
  return attempts.some((a) => /rate limit|quota|credit/i.test(a.error))
    ? `All price providers are rate limited right now. ${detail}. ` +
        `Adding TIINGO_API_KEY (free) gives more headroom.`
    : `Could not load price data. ${detail}`;
}

const freeStack = new FreeStackProvider();

/**
 * Returns the active provider.
 *
 * Setting EODHD_API_KEY switches the whole application from the free US/Canada
 * stack to worldwide coverage. Nothing else in the codebase inspects which
 * provider is in use.
 */
export function getProvider(): MarketDataProvider {
  return eodhd.isConfigured() ? eodhd : freeStack;
}

/**
 * Classifies a symbol as an operating company or a fund.
 * Funds file no financial statements, so balance-sheet scoring cannot apply.
 */
export async function getInstrumentType(symbol: string): Promise<InstrumentType> {
  if (eodhd.isConfigured()) return "unknown";
  return freeStack.getInstrumentType(symbol);
}

/** Peers come from Finnhub and are optional, so they have their own accessor. */
export async function getPeers(symbol: string): Promise<string[]> {
  if (eodhd.isConfigured()) return [];
  return freeStack.getPeers(symbol);
}

/** Reports which capabilities are available, for setup messaging in the UI. */
export function providerStatus() {
  const global = eodhd.isConfigured();
  return {
    activeProvider: global ? eodhd.name : freeStack.name,
    coverage: global ? "worldwide" : "US and Canadian cross-listed",
    fundamentals: true,
    charts: global || twelveData.isConfigured() || tiingo.isConfigured() || yahoo.isConfigured(),
    news: global || finnhub.isConfigured(),
    priceSources: PRICE_SOURCES.filter((s) => s.isConfigured()).map((s) => s.name),
    missing: [
      ...(global || twelveData.isConfigured() ? [] : ["TWELVEDATA_API_KEY"]),
      ...(global || finnhub.isConfigured() ? [] : ["FINNHUB_API_KEY"]),
      ...(global || tiingo.isConfigured() ? [] : ["TIINGO_API_KEY (optional fallback)"]),
    ],
  };
}

export { secEdgar, twelveData, finnhub, tiingo, yahoo, eodhd };
export * from "./types";
