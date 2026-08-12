import type { NormalizedFundamentals } from "../fundamentals/types";
import { eodhd } from "./eodhd";
import { finnhub } from "./finnhub";
import { cikForSymbol, secEdgar } from "./sec-edgar";
import { twelveData } from "./twelvedata";
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
    if (!twelveData.isConfigured()) return [];
    return twelveData.getBars(symbol, timeframe, from, to);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    if (!twelveData.isConfigured()) return null;
    return twelveData.getQuote(symbol).catch(() => null);
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
  async searchSymbols(query: string, limit = 10): Promise<SymbolSearchResult[]> {
    const fromEdgar = await secEdgar.searchSymbols(query, limit).catch(() => []);
    if (fromEdgar.length >= limit || !twelveData.isConfigured()) return fromEdgar;

    const seen = new Set(fromEdgar.map((r) => r.symbol.toUpperCase()));
    const fromTwelve = await twelveData
      .searchSymbols(query, limit)
      .catch(() => [] as SymbolSearchResult[]);

    return [
      // EDGAR results carry a CIK and therefore full fundamentals, so they rank first.
      ...fromEdgar.map((r) => ({ ...r, type: r.type ?? ("stock" as const) })),
      ...fromTwelve.filter((r) => !seen.has(r.symbol.toUpperCase())),
    ].slice(0, limit);
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
    charts: global || twelveData.isConfigured(),
    news: global || finnhub.isConfigured(),
    missing: [
      ...(global || twelveData.isConfigured() ? [] : ["TWELVEDATA_API_KEY"]),
      ...(global || finnhub.isConfigured() ? [] : ["FINNHUB_API_KEY"]),
    ],
  };
}

export { secEdgar, twelveData, finnhub, eodhd };
export * from "./types";
