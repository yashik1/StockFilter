import type { NormalizedFundamentals } from "../fundamentals/types";
import { alpaca } from "./alpaca";
import { eodhd } from "./eodhd";
import { finnhub } from "./finnhub";
import { secEdgar } from "./sec-edgar";
import type {
  Bar,
  CompanyProfile,
  Filing,
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
 *   fundamentals + filings + sector -> SEC EDGAR (authoritative, no key, no cap)
 *   price bars + quotes             -> Alpaca    (7+ yrs of minute bars, free)
 *   news + logo + peers             -> Finnhub   (free tier covers these)
 *
 * Anything unavailable degrades to empty rather than throwing, so a missing
 * optional key never takes down a page.
 */
class FreeStackProvider implements MarketDataProvider {
  readonly name = "SEC EDGAR + Alpaca + Finnhub";

  /** EDGAR alone needs no credentials, so fundamentals always work. */
  isConfigured(): boolean {
    return true;
  }

  async getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]> {
    if (!alpaca.isConfigured()) return [];
    return alpaca.getBars(symbol, timeframe, from, to);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    if (!alpaca.isConfigured()) return null;
    return alpaca.getQuote(symbol);
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

  async searchSymbols(query: string, limit?: number): Promise<SymbolSearchResult[]> {
    return secEdgar.searchSymbols(query, limit).catch(() => []);
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
    charts: global || alpaca.isConfigured(),
    news: global || finnhub.isConfigured(),
    missing: [
      ...(global || alpaca.isConfigured() ? [] : ["ALPACA_API_KEY_ID"]),
      ...(global || finnhub.isConfigured() ? [] : ["FINNHUB_API_KEY"]),
    ],
  };
}

export { secEdgar, alpaca, finnhub, eodhd };
export * from "./types";
