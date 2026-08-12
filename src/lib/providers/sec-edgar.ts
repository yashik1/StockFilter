import { normalizeCompanyFacts } from "../fundamentals/normalize";
import type { NormalizedFundamentals, SecCompanyFacts } from "../fundamentals/types";
import { SEC_USER_AGENT } from "./sec-config";
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

const SEC_HEADERS = { "User-Agent": SEC_USER_AGENT, Accept: "application/json" };

/** Cache windows, in seconds. Filings change at most a few times a quarter. */
const TICKER_MAP_TTL = 60 * 60 * 24;
const SUBMISSIONS_TTL = 60 * 60 * 6;
const FACTS_TTL = 60 * 60 * 12;

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerMapPromise: Promise<Map<string, TickerEntry>> | null = null;

/**
 * Loads the SEC's ticker-to-CIK map (~10,000 entries), memoised for the life of
 * the server process. Every other EDGAR endpoint is keyed by CIK, so this is the
 * entry point for symbol lookups.
 */
export async function loadTickerMap(): Promise<Map<string, TickerEntry>> {
  tickerMapPromise ??= (async () => {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: SEC_HEADERS,
      next: { revalidate: TICKER_MAP_TTL },
    });
    if (!res.ok) throw new Error(`SEC ticker map: HTTP ${res.status}`);
    const raw = (await res.json()) as Record<string, TickerEntry>;

    const map = new Map<string, TickerEntry>();
    for (const entry of Object.values(raw)) {
      map.set(entry.ticker.toUpperCase(), entry);
    }
    return map;
  })().catch((err) => {
    // Never cache a failure, or the process is stuck with it forever.
    tickerMapPromise = null;
    throw err;
  });

  return tickerMapPromise;
}

export function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

export async function cikForSymbol(symbol: string): Promise<string | null> {
  const map = await loadTickerMap();
  const upper = symbol.toUpperCase();

  const direct = map.get(upper);
  if (direct) return padCik(direct.cik_str);

  // Share classes are written with a dot by most data sources (BRK.B) but with
  // a hyphen by EDGAR (BRK-B). Without this, every multi-class company fails.
  if (upper.includes(".")) {
    const hyphenated = map.get(upper.replace(/\./g, "-"));
    if (hyphenated) return padCik(hyphenated.cik_str);
  }

  return null;
}

interface SecSubmissions {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  tickers: string[];
  exchanges: string[];
  entityType: string;
  stateOfIncorporation: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

async function fetchSubmissions(cik: string): Promise<SecSubmissions | null> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: SEC_HEADERS,
    next: { revalidate: SUBMISSIONS_TTL },
  });
  if (!res.ok) return null;
  return (await res.json()) as SecSubmissions;
}

/**
 * SEC EDGAR — the fundamentals and filings backbone.
 *
 * Free, no API key, and not rate limited by quota (only by a 10 req/s fair-use
 * ceiling), which is why the screener can be rebuilt nightly across the whole
 * universe at no cost. Covers US filers plus Canadian companies that cross-list
 * in the US and file 40-F under the MJDS regime.
 *
 * It has no price data, so it implements only the fundamentals half of the
 * interface and defers bars and quotes to the market data provider.
 */
export class SecEdgarProvider implements MarketDataProvider {
  readonly name = "SEC EDGAR";

  /** No credentials required beyond a User-Agent. */
  isConfigured(): boolean {
    return true;
  }

  async getFundamentals(symbol: string): Promise<NormalizedFundamentals | null> {
    const cik = await cikForSymbol(symbol);
    if (!cik) return null;
    return this.getFundamentalsByCik(cik);
  }

  async getFundamentalsByCik(cik: string): Promise<NormalizedFundamentals | null> {
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: SEC_HEADERS,
      next: { revalidate: FACTS_TTL },
    });
    if (!res.ok) return null;

    const raw = (await res.json()) as SecCompanyFacts;
    return normalizeCompanyFacts(raw);
  }

  async getProfile(symbol: string): Promise<CompanyProfile | null> {
    const cik = await cikForSymbol(symbol);
    if (!cik) return null;

    const sub = await fetchSubmissions(cik);
    if (!sub) return null;

    return {
      symbol: symbol.toUpperCase(),
      name: sub.name,
      exchange: sub.exchanges?.[0] ?? null,
      // EDGAR does not carry a country field; filers using IFRS via 40-F are
      // Canadian by definition of the MJDS regime.
      country: sub.stateOfIncorporation === "A1" ? "CA" : "US",
      currency: null,
      sicCode: sub.sic || null,
      sicDescription: sub.sicDescription || null,
      industry: sub.sicDescription || null,
      website: null,
      logo: null,
      marketCap: null,
      sharesOutstanding: null,
      cik,
      description: null,
    };
  }

  async getFilings(symbol: string, limit = 25): Promise<Filing[]> {
    const cik = await cikForSymbol(symbol);
    if (!cik) return [];

    const sub = await fetchSubmissions(cik);
    if (!sub?.filings?.recent) return [];

    const r = sub.filings.recent;
    const cikNum = String(Number(cik));
    const filings: Filing[] = [];

    // Only the filings a person would actually want to read.
    const interesting = /^(10-K|10-Q|8-K|20-F|40-F|6-K|DEF 14A|S-1)/;

    for (let i = 0; i < r.accessionNumber.length && filings.length < limit; i++) {
      const form = r.form[i];
      if (!interesting.test(form)) continue;

      const accn = r.accessionNumber[i];
      const bare = accn.replace(/-/g, "");
      const doc = r.primaryDocument[i];
      filings.push({
        form,
        filedAt: r.filingDate[i],
        periodOfReport: r.reportDate[i] || null,
        description: r.primaryDocDescription?.[i] || null,
        url: doc
          ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${doc}`
          : `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${accn}-index.htm`,
      });
    }

    return filings;
  }

  async searchSymbols(query: string, limit = 10): Promise<SymbolSearchResult[]> {
    const map = await loadTickerMap();
    const q = query.trim().toUpperCase();
    if (!q) return [];

    const exact: SymbolSearchResult[] = [];
    const prefix: SymbolSearchResult[] = [];
    const nameMatch: SymbolSearchResult[] = [];

    for (const entry of map.values()) {
      const ticker = entry.ticker.toUpperCase();
      const title = entry.title.toUpperCase();
      const result: SymbolSearchResult = {
        symbol: ticker,
        name: entry.title,
        exchange: null,
        cik: padCik(entry.cik_str),
      };

      if (ticker === q) exact.push(result);
      else if (ticker.startsWith(q)) prefix.push(result);
      else if (title.includes(q)) nameMatch.push(result);

      if (exact.length + prefix.length >= limit * 3) break;
    }

    return [...exact, ...prefix, ...nameMatch].slice(0, limit);
  }

  // ---- Price data is not available from EDGAR ----

  async getBars(_symbol: string, _tf: Timeframe, _from: Date, _to: Date): Promise<Bar[]> {
    return [];
  }

  async getQuote(_symbol: string): Promise<Quote | null> {
    return null;
  }

  async getNews(_symbol: string, _limit?: number): Promise<NewsItem[]> {
    return [];
  }
}

export const secEdgar = new SecEdgarProvider();
