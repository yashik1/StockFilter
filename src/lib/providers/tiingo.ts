import type { NormalizedFundamentals } from "../fundamentals/types";
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

const BASE = "https://api.tiingo.com";

/**
 * Tiingo — the daily-history fallback.
 *
 * Its free tier carries 30+ years of end-of-day prices, which is deeper than
 * anything else free, and its limits are counted per hour and per month rather
 * than per minute. That makes it a good partner to Twelve Data, whose 8/minute
 * ceiling is the one users actually hit.
 *
 * Intraday comes from the IEX endpoint and only covers recent sessions, so this
 * provider is used for daily and weekly bars and leaves fine-grained intraday
 * to the primary.
 */
export class TiingoProvider implements MarketDataProvider {
  readonly name = "Tiingo";

  private get token() {
    return process.env.TIINGO_API_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("Tiingo", ["TIINGO_API_KEY"]);
    }
    return { Authorization: `Token ${this.token}`, "Content-Type": "application/json" };
  }

  /** True when this provider can serve the requested timeframe. */
  supports(timeframe: Timeframe): boolean {
    return timeframe === "1Day" || timeframe === "1Week";
  }

  async getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]> {
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // Tiingo has no native weekly bucket, so weekly is aggregated from daily.
    const params = new URLSearchParams({
      startDate: iso(from),
      endDate: iso(to),
      resampleFreq: "daily",
    });

    const res = await fetch(
      `${BASE}/tiingo/daily/${encodeURIComponent(symbol)}/prices?${params}`,
      { headers: this.headers(), next: { revalidate: 3600 } },
    );

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("Tiingo rate limit reached.");
      }
      if (res.status === 404) return [];
      throw new Error(`Tiingo bars ${symbol}: HTTP ${res.status}`);
    }

    const rows = (await res.json()) as {
      date: string; open: number; high: number; low: number; close: number; volume: number;
      adjOpen?: number; adjHigh?: number; adjLow?: number; adjClose?: number; adjVolume?: number;
    }[];

    const daily: Bar[] = (rows ?? [])
      .map((r) => ({
        time: Math.floor(Date.parse(r.date) / 1000),
        // Split-adjusted values keep long histories continuous.
        open: r.adjOpen ?? r.open,
        high: r.adjHigh ?? r.high,
        low: r.adjLow ?? r.low,
        close: r.adjClose ?? r.close,
        volume: r.adjVolume ?? r.volume ?? 0,
      }))
      .filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close));

    return timeframe === "1Week" ? toWeekly(daily) : daily;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const res = await fetch(`${BASE}/iex/${encodeURIComponent(symbol)}`, {
      headers: this.headers(),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Tiingo rate limit reached.");
      return null;
    }

    const [q] = (await res.json()) as {
      last?: number; prevClose?: number; high?: number; low?: number;
      volume?: number; timestamp?: string;
    }[];
    if (!q?.last) return null;

    const change = q.prevClose != null ? q.last - q.prevClose : null;
    return {
      symbol: symbol.toUpperCase(),
      price: q.last,
      change,
      changePercent: change != null && q.prevClose ? change / q.prevClose : null,
      previousClose: q.prevClose ?? null,
      dayHigh: q.high ?? null,
      dayLow: q.low ?? null,
      volume: q.volume ?? null,
      freshness: "realtime-iex",
      asOf: q.timestamp ?? null,
    };
  }

  // ---- Not served by Tiingo here ----

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

  async searchSymbols(_query: string, _limit?: number): Promise<SymbolSearchResult[]> {
    return [];
  }
}

/** Aggregates daily bars into weekly ones, keyed by ISO week. */
export function toWeekly(daily: Bar[]): Bar[] {
  const weeks: Bar[] = [];
  let current: Bar | null = null;
  let currentKey = "";

  for (const bar of daily) {
    const date = new Date(bar.time * 1000);
    // Monday-anchored week key.
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);

    if (key !== currentKey) {
      if (current) weeks.push(current);
      current = { ...bar, time: Math.floor(monday.getTime() / 1000) };
      currentKey = key;
    } else if (current) {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    }
  }
  if (current) weeks.push(current);
  return weeks;
}

export const tiingo = new TiingoProvider();
