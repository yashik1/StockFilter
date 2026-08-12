import type {
  CanonicalField,
  Fact,
  FinancialPeriod,
  NormalizedFundamentals,
} from "../fundamentals/types";
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
import { ProviderNotConfiguredError } from "./types";

const BASE = "https://eodhd.com/api";

/**
 * EODHD — the worldwide upgrade path.
 *
 * Dormant until `EODHD_API_KEY` is set, at which point it replaces the free
 * US/Canada stack and the app covers 60+ exchanges and 150,000+ tickers with
 * global fundamentals, without any other code change.
 *
 * Freshness note: EODHD's WebSocket feed is genuinely real time for US
 * equities, forex and crypto, but international exchanges are 15-20 minutes
 * delayed because of per-exchange licensing. Quotes are therefore reported as
 * `delayed-15min` for non-US symbols rather than claiming to be live.
 */
export class EodhdProvider implements MarketDataProvider {
  readonly name = "EODHD";

  private get token() {
    return process.env.EODHD_API_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private url(path: string, params: Record<string, string> = {}): string {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("EODHD", ["EODHD_API_KEY"]);
    }
    const search = new URLSearchParams({ ...params, api_token: this.token!, fmt: "json" });
    return `${BASE}${path}?${search}`;
  }

  /** EODHD expects `TICKER.EXCHANGE`; bare tickers default to US. */
  private qualify(symbol: string): string {
    return symbol.includes(".") ? symbol : `${symbol}.US`;
  }

  private isUs(symbol: string): boolean {
    return this.qualify(symbol).endsWith(".US");
  }

  async getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]> {
    const s = this.qualify(symbol);

    if (timeframe === "1Day" || timeframe === "1Week") {
      const res = await fetch(
        this.url(`/eod/${s}`, {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          period: timeframe === "1Week" ? "w" : "d",
        }),
        { next: { revalidate: 3600 } },
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as {
        date: string; open: number; high: number; low: number; close: number; volume: number;
      }[];
      return (rows ?? []).map((r) => ({
        time: Math.floor(Date.parse(`${r.date}T00:00:00Z`) / 1000),
        open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
      }));
    }

    // EODHD supports 1m, 5m and 1h natively; 15m is resampled from 5m.
    const interval = timeframe === "1Hour" ? "1h" : timeframe === "1Min" ? "1m" : "5m";
    const res = await fetch(
      this.url(`/intraday/${s}`, {
        interval,
        from: String(Math.floor(from.getTime() / 1000)),
        to: String(Math.floor(to.getTime() / 1000)),
      }),
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return [];

    const rows = (await res.json()) as {
      timestamp: number; open: number; high: number; low: number; close: number; volume: number;
    }[];
    const bars: Bar[] = (rows ?? [])
      .filter((r) => r.open != null && r.close != null)
      .map((r) => ({
        time: r.timestamp,
        open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
      }));

    return timeframe === "15Min" ? resample(bars, 900) : bars;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const res = await fetch(this.url(`/real-time/${this.qualify(symbol)}`), {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;

    const q = (await res.json()) as {
      close?: number; previousClose?: number; change?: number;
      change_p?: number; high?: number; low?: number; volume?: number; timestamp?: number;
    };
    const price = typeof q.close === "number" ? q.close : null;

    return {
      symbol: symbol.toUpperCase(),
      price,
      change: q.change ?? null,
      changePercent: q.change_p != null ? q.change_p / 100 : null,
      previousClose: q.previousClose ?? null,
      dayHigh: q.high ?? null,
      dayLow: q.low ?? null,
      volume: q.volume ?? null,
      // Only US equities are genuinely live on this feed.
      freshness: this.isUs(symbol) ? "realtime-iex" : "delayed-15min",
      asOf: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : null,
    };
  }

  async getProfile(symbol: string): Promise<CompanyProfile | null> {
    const raw = await this.fetchFundamentals(symbol);
    if (!raw) return null;

    const g = raw.General ?? {};
    return {
      symbol: symbol.toUpperCase(),
      name: g.Name ?? symbol,
      exchange: g.Exchange ?? null,
      country: g.CountryISO ?? null,
      currency: g.CurrencyCode ?? null,
      sicCode: null,
      sicDescription: g.Industry ?? null,
      industry: g.Industry ?? g.Sector ?? null,
      website: g.WebURL ?? null,
      logo: g.LogoURL ? `https://eodhd.com${g.LogoURL}` : null,
      marketCap: raw.Highlights?.MarketCapitalization ?? null,
      sharesOutstanding: raw.SharesStats?.SharesOutstanding ?? null,
      cik: g.CIK ?? null,
      description: g.Description ?? null,
    };
  }

  async getFundamentals(symbol: string): Promise<NormalizedFundamentals | null> {
    const raw = await this.fetchFundamentals(symbol);
    return raw ? mapEodhdFundamentals(raw, symbol) : null;
  }

  private async fetchFundamentals(symbol: string): Promise<EodhdFundamentals | null> {
    const res = await fetch(this.url(`/fundamentals/${this.qualify(symbol)}`), {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!res.ok) return null;
    return (await res.json()) as EodhdFundamentals;
  }

  async getNews(symbol: string, limit = 20): Promise<NewsItem[]> {
    const res = await fetch(
      this.url("/news", { s: this.qualify(symbol), limit: String(limit) }),
      { next: { revalidate: 900 } },
    );
    if (!res.ok) return [];

    const items = (await res.json()) as {
      title?: string; content?: string; link?: string; date?: string;
    }[];
    return (items ?? [])
      .filter((n) => n.title && n.link)
      .map((n, i) => ({
        id: `${n.link}-${i}`,
        headline: n.title!,
        summary: n.content ? n.content.slice(0, 280) : null,
        source: "EODHD",
        url: n.link!,
        publishedAt: n.date ?? new Date().toISOString(),
        imageUrl: null,
      }));
  }

  async searchSymbols(query: string, limit = 10): Promise<SymbolSearchResult[]> {
    const res = await fetch(this.url(`/search/${encodeURIComponent(query)}`, {
      limit: String(limit),
    }), { next: { revalidate: 3600 } });
    if (!res.ok) return [];

    const rows = (await res.json()) as {
      Code: string; Name: string; Exchange: string;
    }[];
    return (rows ?? []).map((r) => ({
      symbol: r.Exchange === "US" ? r.Code : `${r.Code}.${r.Exchange}`,
      name: r.Name,
      exchange: r.Exchange,
      cik: null,
    }));
  }

  /** EODHD does not expose a filings index. */
  async getFilings(_symbol: string, _limit?: number): Promise<Filing[]> {
    return [];
  }
}

// ----------------------------------------------------------------- mapping

interface EodhdStatements {
  yearly?: Record<string, Record<string, string | number | null>>;
}

export interface EodhdFundamentals {
  General?: Record<string, string | null> & { CIK?: string; CountryISO?: string };
  Highlights?: { MarketCapitalization?: number };
  SharesStats?: { SharesOutstanding?: number };
  Financials?: {
    Balance_Sheet?: EodhdStatements;
    Income_Statement?: EodhdStatements;
    Cash_Flow?: EodhdStatements;
  };
}

/** EODHD statement keys mapped onto the canonical schema. */
const BALANCE_SHEET_MAP: Partial<Record<CanonicalField, string>> = {
  assets: "totalAssets",
  liabilities: "totalLiab",
  equity: "totalStockholderEquity",
  currentAssets: "totalCurrentAssets",
  currentLiabilities: "totalCurrentLiabilities",
  cash: "cash",
  receivables: "netReceivables",
  inventory: "inventory",
  ppe: "propertyPlantEquipment",
  longTermDebt: "longTermDebt",
  shortTermDebt: "shortTermDebt",
  retainedEarnings: "retainedEarnings",
};

const INCOME_MAP: Partial<Record<CanonicalField, string>> = {
  revenue: "totalRevenue",
  costOfRevenue: "costOfRevenue",
  grossProfit: "grossProfit",
  operatingIncome: "operatingIncome",
  netIncome: "netIncome",
  incomeBeforeTax: "incomeBeforeTax",
  interestExpense: "interestExpense",
  sga: "sellingGeneralAdministrative",
  depreciation: "depreciationAndAmortization",
};

const CASH_FLOW_MAP: Partial<Record<CanonicalField, string>> = {
  operatingCashFlow: "totalCashFromOperatingActivities",
  capex: "capitalExpenditures",
  dividendsPaid: "dividendsPaid",
};

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converts an EODHD fundamentals payload into the same canonical model the SEC
 * normalizer produces, so scoring is identical whichever provider supplied it.
 *
 * Exported separately from the class so it can be unit tested without a key.
 */
export function mapEodhdFundamentals(
  raw: EodhdFundamentals,
  symbol: string,
): NormalizedFundamentals {
  const bs = raw.Financials?.Balance_Sheet?.yearly ?? {};
  const is = raw.Financials?.Income_Statement?.yearly ?? {};
  const cf = raw.Financials?.Cash_Flow?.yearly ?? {};

  const dates = [...new Set([...Object.keys(bs), ...Object.keys(is), ...Object.keys(cf)])]
    .sort()
    .reverse()
    .slice(0, 12);

  const shares = raw.SharesStats?.SharesOutstanding ?? null;

  const annual: FinancialPeriod[] = dates.map((date) => {
    const fiscalYear = Number(date.slice(0, 4));
    const facts: Partial<Record<CanonicalField, Fact>> = {};

    const put = (field: CanonicalField, value: number | null, source: string) => {
      if (value == null) return;
      facts[field] = {
        value,
        unit: "USD",
        end: date,
        fiscalYear,
        fiscalPeriod: "FY",
        form: "annual-report",
        sourceConcept: `eodhd:${source}`,
        sourceFilingUrl: null,
      };
    };

    for (const [field, key] of Object.entries(BALANCE_SHEET_MAP)) {
      put(field as CanonicalField, toNumber(bs[date]?.[key]), key);
    }
    for (const [field, key] of Object.entries(INCOME_MAP)) {
      put(field as CanonicalField, toNumber(is[date]?.[key]), key);
    }
    for (const [field, key] of Object.entries(CASH_FLOW_MAP)) {
      put(field as CanonicalField, toNumber(cf[date]?.[key]), key);
    }

    // Same derivation the SEC normalizer applies, for consistency.
    if (!facts.liabilities && facts.assets && facts.equity) {
      facts.liabilities = {
        ...facts.assets,
        value: facts.assets.value - facts.equity.value,
        sourceConcept: "derived:Assets-Equity",
        derived: true,
      };
    }

    if (shares != null && shares > 0) put("sharesOutstanding", shares, "SharesOutstanding");

    return { fiscalYear, fiscalPeriod: "FY", end: date, form: "annual-report", facts };
  });

  const latest = annual[0];
  const allFields = [
    ...Object.keys(BALANCE_SHEET_MAP),
    ...Object.keys(INCOME_MAP),
    ...Object.keys(CASH_FLOW_MAP),
  ] as CanonicalField[];

  return {
    cik: raw.General?.CIK ?? "",
    entityName: raw.General?.Name ?? symbol,
    taxonomy: "us-gaap",
    annual,
    missingFields: latest ? allFields.filter((f) => latest.facts[f] === undefined) : allFields,
  };
}

/** Aggregates finer bars into a coarser bucket, used to build 15m from 5m. */
export function resample(bars: Bar[], bucketSeconds: number): Bar[] {
  const out: Bar[] = [];
  let current: Bar | null = null;

  for (const bar of bars) {
    const bucket = Math.floor(bar.time / bucketSeconds) * bucketSeconds;
    if (!current || current.time !== bucket) {
      if (current) out.push(current);
      current = { ...bar, time: bucket };
    } else {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    }
  }
  if (current) out.push(current);
  return out;
}

export const eodhd = new EodhdProvider();
