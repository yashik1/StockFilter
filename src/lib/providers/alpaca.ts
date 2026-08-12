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

const DATA_URL = "https://data.alpaca.markets/v2";

/** Alpaca caps a single bars response; paging continues via next_page_token. */
const PAGE_LIMIT = 10_000;
/** Safety valve so a wide minute-range request cannot loop indefinitely. */
const MAX_PAGES = 5;

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Alpaca Market Data — price history and quotes.
 *
 * Chosen because its free Basic tier serves 7+ years of *minute* bars at 200
 * requests/minute, which is what makes the 1m/5m/15m/1h history filters possible
 * at zero cost. Finnhub's free tier cannot: it moved candles behind its paid
 * plans in 2025 and returns 403.
 *
 * The free tier streams IEX in real time and consolidated (SIP) data on a
 * 15-minute delay. Which one a figure came from is reported via `freshness` and
 * shown as a badge, so a delayed price is never passed off as live.
 */
export class AlpacaProvider implements MarketDataProvider {
  readonly name = "Alpaca";

  private get keyId() {
    return process.env.ALPACA_API_KEY_ID;
  }

  private get secretKey() {
    return process.env.ALPACA_API_SECRET_KEY;
  }

  /** IEX on the free plan; set to "sip" if you hold a paid subscription. */
  private get feed() {
    return process.env.ALPACA_FEED ?? "iex";
  }

  isConfigured(): boolean {
    return Boolean(this.keyId && this.secretKey);
  }

  private headers(): Record<string, string> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("Alpaca", [
        "ALPACA_API_KEY_ID",
        "ALPACA_API_SECRET_KEY",
      ]);
    }
    return {
      "APCA-API-KEY-ID": this.keyId!,
      "APCA-API-SECRET-KEY": this.secretKey!,
      Accept: "application/json",
    };
  }

  async getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]> {
    const bars: Bar[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        timeframe,
        start: from.toISOString(),
        end: to.toISOString(),
        limit: String(PAGE_LIMIT),
        adjustment: "split",
        feed: this.feed,
        sort: "asc",
      });
      if (pageToken) params.set("page_token", pageToken);

      const res = await fetch(
        `${DATA_URL}/stocks/${encodeURIComponent(symbol)}/bars?${params}`,
        { headers: this.headers(), next: { revalidate: revalidateFor(timeframe) } },
      );

      if (!res.ok) {
        // A symbol with no data on this feed is a normal outcome, not an error.
        if (res.status === 404) return bars;
        throw new Error(`Alpaca bars ${symbol}: HTTP ${res.status} ${await res.text()}`);
      }

      const json = (await res.json()) as { bars?: AlpacaBar[]; next_page_token?: string | null };
      for (const b of json.bars ?? []) {
        bars.push({
          time: Math.floor(Date.parse(b.t) / 1000),
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
          volume: b.v,
        });
      }

      if (!json.next_page_token) break;
      pageToken = json.next_page_token;
    }

    return bars;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const params = new URLSearchParams({ feed: this.feed });
    const res = await fetch(
      `${DATA_URL}/stocks/${encodeURIComponent(symbol)}/snapshot?${params}`,
      { headers: this.headers(), next: { revalidate: 30 } },
    );
    if (!res.ok) return null;

    const snap = (await res.json()) as {
      latestTrade?: { p: number; t: string };
      dailyBar?: { o: number; h: number; l: number; c: number; v: number };
      prevDailyBar?: { c: number };
    };

    const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
    const previousClose = snap.prevDailyBar?.c ?? null;
    const change = price != null && previousClose != null ? price - previousClose : null;

    return {
      symbol: symbol.toUpperCase(),
      price,
      change,
      changePercent:
        change != null && previousClose ? change / previousClose : null,
      previousClose,
      dayHigh: snap.dailyBar?.h ?? null,
      dayLow: snap.dailyBar?.l ?? null,
      volume: snap.dailyBar?.v ?? null,
      freshness: this.feed === "iex" ? "realtime-iex" : "delayed-15min",
      asOf: snap.latestTrade?.t ?? null,
    };
  }

  // ---- Not served by Alpaca ----

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

/** Intraday bars go stale fast; daily bars do not. */
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

export const alpaca = new AlpacaProvider();
