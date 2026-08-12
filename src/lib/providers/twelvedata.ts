import type { NormalizedFundamentals } from "../fundamentals/types";
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
import { ProviderNotConfiguredError } from "./types";

const BASE = "https://api.twelvedata.com";

/** Largest page the API will return in one call. */
const MAX_OUTPUT_SIZE = 5000;

/** Our timeframes mapped to Twelve Data's interval names. */
const INTERVALS: Record<Timeframe, string> = {
  "1Min": "1min",
  "5Min": "5min",
  "15Min": "15min",
  "1Hour": "1h",
  "1Day": "1day",
  "1Week": "1week",
};

interface TwelveDataValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

/**
 * Twelve Data — price history and quotes.
 *
 * Chosen over broker-issued feeds because a key is a plain email signup with no
 * brokerage account or identity check, while still covering the full intraday
 * range this app offers: 1min, 5min, 15min, 1h, 1day and 1week.
 *
 * Free plan limits worth knowing:
 *  - 800 credits/day and 8 credits/minute. One chart view costs one credit.
 *  - 1-minute history starts at 2020-02-10; earlier intraday does not exist.
 *  - Prices carry a short delay, so quotes are reported as delayed rather than
 *    live. Set TWELVEDATA_REALTIME=true if you are on a paid real-time plan.
 */
export class TwelveDataProvider implements MarketDataProvider {
  readonly name = "Twelve Data";

  private get apiKey() {
    return process.env.TWELVEDATA_API_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private url(path: string, params: Record<string, string>): string {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("Twelve Data", ["TWELVEDATA_API_KEY"]);
    }
    const search = new URLSearchParams({ ...params, apikey: this.apiKey! });
    return `${BASE}${path}?${search}`;
  }

  async getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]> {
    const url = this.url("/time_series", {
      symbol,
      interval: INTERVALS[timeframe],
      start_date: formatDate(from),
      end_date: formatDate(to),
      outputsize: String(MAX_OUTPUT_SIZE),
      order: "asc",
      // Ask for UTC so timestamps parse unambiguously regardless of the
      // exchange's local timezone or daylight saving.
      timezone: "UTC",
    });

    const res = await fetch(url, { next: { revalidate: revalidateFor(timeframe) } });
    if (!res.ok) throw new Error(httpMessage(res.status, symbol));

    const json = (await res.json()) as {
      status?: string;
      message?: string;
      values?: TwelveDataValue[];
    };

    // The API answers business errors with HTTP 200 and status:"error", so the
    // failure has to be read out of the body.
    //
    // These are never converted to an empty result. "No bars" and "your key is
    // invalid" look identical to the user otherwise, and the real message —
    // wrong key, symbol not on your plan, quota exhausted — is the only thing
    // that says what to do about it.
    if (json.status === "error") {
      throw new Error(`Twelve Data: ${json.message ?? "unknown error"}`);
    }

    return (json.values ?? [])
      .map((v) => ({
        time: Math.floor(Date.parse(`${v.datetime.replace(" ", "T")}Z`) / 1000),
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
        volume: Number(v.volume ?? 0),
      }))
      .filter(
        (b) =>
          Number.isFinite(b.time) &&
          Number.isFinite(b.open) &&
          Number.isFinite(b.close),
      );
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const res = await fetch(this.url("/quote", { symbol }), {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;

    const q = (await res.json()) as {
      status?: string;
      close?: string;
      previous_close?: string;
      change?: string;
      percent_change?: string;
      high?: string;
      low?: string;
      volume?: string;
      datetime?: string;
    };
    // Same rule as getBars: report the cause rather than silently reporting
    // "no price", which is indistinguishable from a bad key or an exhausted quota.
    if (q.status === "error") {
      throw new Error(`Twelve Data: ${(q as { message?: string }).message ?? "unknown error"}`);
    }

    const num = (v: string | undefined) => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const percentChange = num(q.percent_change);
    return {
      symbol: symbol.toUpperCase(),
      price: num(q.close),
      change: num(q.change),
      // The API reports percent change as a percentage; we store a ratio.
      changePercent: percentChange != null ? percentChange / 100 : null,
      previousClose: num(q.previous_close),
      dayHigh: num(q.high),
      dayLow: num(q.low),
      volume: num(q.volume),
      freshness:
        process.env.TWELVEDATA_REALTIME === "true" ? "realtime-iex" : "delayed-15min",
      asOf: q.datetime ?? null,
    };
  }

  async searchSymbols(query: string, limit = 10): Promise<SymbolSearchResult[]> {
    // symbol_search is public and does not consume credits.
    const res = await fetch(
      `${BASE}/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=${limit}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: {
        symbol: string;
        instrument_name: string;
        exchange: string;
        instrument_type?: string;
        country?: string;
      }[];
    };
    return (json.data ?? []).slice(0, limit).map((d) => ({
      symbol: d.symbol,
      name: d.instrument_name,
      exchange: d.exchange,
      cik: null,
      type: classifyInstrumentType(d.instrument_type),
    }));
  }

  /**
   * Determines whether a symbol is a fund or an operating company.
   *
   * Used to decide whether balance-sheet scoring applies at all. Returns
   * "unknown" rather than guessing when the provider gives no answer.
   */
  async getInstrumentType(symbol: string): Promise<InstrumentType> {
    const results = await this.searchSymbols(symbol, 10).catch(() => []);
    const exact = results.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
    return exact?.type ?? "unknown";
  }

  // ---- Not served by Twelve Data on the free plan ----

  async getProfile(_symbol: string): Promise<CompanyProfile | null> {
    return null;
  }

  async getFundamentals(_symbol: string): Promise<NormalizedFundamentals | null> {
    return null;
  }

  async getNews(_symbol: string, _limit?: number): Promise<NewsItem[]> {
    return [];
  }

  async getFilings(_symbol: string, _limit?: number): Promise<Filing[]> {
    return [];
  }
}

/**
 * Turns an HTTP status into something a person can act on.
 *
 * The raw status alone ("HTTP 401") does not say whether the key is wrong, the
 * plan lacks the endpoint, or the quota is spent — which are three different
 * fixes.
 */
function httpMessage(status: number, symbol: string): string {
  switch (status) {
    case 401:
      return "Twelve Data rejected the API key. Check TWELVEDATA_API_KEY is correct and active.";
    case 403:
      return (
        `Twelve Data denied access to ${symbol}. This usually means the symbol or ` +
        `interval is not included in your plan.`
      );
    case 404:
      return `Twelve Data has no data for ${symbol}.`;
    case 429:
      return (
        "Twelve Data rate limit reached. The free plan allows 8 requests/minute " +
        "and 800/day — wait a moment and reload."
      );
    default:
      return `Twelve Data request failed for ${symbol} (HTTP ${status}).`;
  }
}

/**
 * Maps the provider's instrument_type label onto our own classification.
 * Funds appear under several names ("ETF", "Mutual Fund", "Trust"), all of
 * which share the property that matters here: no financial statements.
 */
export function classifyInstrumentType(raw: string | undefined): InstrumentType {
  if (!raw) return "unknown";
  const value = raw.toLowerCase();
  if (/etf|fund|trust|etn|index/.test(value)) return "etf";
  if (/stock|share|equity|depositary|adr/.test(value)) return "stock";
  return "unknown";
}

/** `YYYY-MM-DD HH:MM:SS`, the format the API accepts. */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Intraday bars go stale fast; daily and weekly do not. */
function revalidateFor(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1Min":
      return 60;
    case "5Min":
      return 300;
    case "15Min":
      return 900;
    case "1Hour":
      return 1800;
    default:
      return 3600;
  }
}

export const twelveData = new TwelveDataProvider();
