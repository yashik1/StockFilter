import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPriceCache,
  fetchBarsWithFailover,
  fetchQuoteWithFailover,
  type PriceSource,
} from "./failover";
import type { Bar, Quote, Timeframe } from "./types";

const BAR: Bar = { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 };

const QUOTE: Quote = {
  symbol: "AAPL", price: 100, change: 1, changePercent: 0.01, previousClose: 99,
  dayHigh: 101, dayLow: 98, volume: 1000, freshness: "realtime-iex", asOf: null,
};

function source(
  name: string,
  behaviour: {
    bars?: Bar[] | Error;
    quote?: Quote | null | Error;
    configured?: boolean;
    supports?: (tf: Timeframe) => boolean;
  },
): PriceSource & { barCalls: number; quoteCalls: number } {
  const s = {
    name,
    barCalls: 0,
    quoteCalls: 0,
    isConfigured: () => behaviour.configured ?? true,
    supports: behaviour.supports,
    async getBars() {
      s.barCalls++;
      if (behaviour.bars instanceof Error) throw behaviour.bars;
      return behaviour.bars ?? [];
    },
    async getQuote() {
      s.quoteCalls++;
      if (behaviour.quote instanceof Error) throw behaviour.quote;
      return behaviour.quote ?? null;
    },
  };
  return s;
}

/** A daily series of `days` bars starting at `start`, oldest first. */
function barsSpanning(start: Date, days: number): Bar[] {
  return Array.from({ length: days }, (_, i) => ({
    ...BAR,
    time: Math.floor(start.getTime() / 1000) + i * 86_400,
  }));
}

const from = new Date("2024-01-01T00:00:00Z");
const monthEnd = new Date("2024-01-31T00:00:00Z");

/** A series that covers the whole window, for tests not about coverage. */
const FULL = barsSpanning(from, 30);
const to = new Date("2024-02-01T00:00:00Z");

beforeEach(() => clearPriceCache());

describe("bars failover", () => {
  it("uses the first provider that answers", async () => {
    const a = source("A", { bars: FULL });
    const b = source("B", { bars: FULL });

    const result = await fetchBarsWithFailover([a, b], "AAPL", "1Day", from, to);
    expect(result.source).toBe("A");
    expect(b.barCalls).toBe(0);
  });

  // The whole point of the chain.
  it("falls through when the first provider is rate limited", async () => {
    const a = source("A", { bars: new Error("Twelve Data rate limit reached") });
    const b = source("B", { bars: FULL });

    const result = await fetchBarsWithFailover([a, b], "AAPL", "1Day", from, to);
    expect(result.value).toEqual(FULL);
    expect(result.source).toBe("B");
    expect(result.attempts[0]).toMatchObject({ provider: "A" });
  });

  // The bug that hid XEQT. Twelve Data reports an uncovered symbol by throwing
  // "has no data", which used to end the chain — so Yahoo, the only provider
  // with coverage outside the US, was never asked about a Toronto listing.
  it("asks the next provider when one has no data for the symbol", async () => {
    const usOnly = source("Twelve Data", {
      bars: new Error("Twelve Data has no data for XEQT."),
    });
    const worldwide = source("Yahoo Finance", { bars: FULL });

    const result = await fetchBarsWithFailover(
      [usOnly, worldwide], "XEQT", "1Day", from, to,
    );

    expect(worldwide.barCalls).toBe(1);
    expect(result.source).toBe("Yahoo Finance");
    expect(result.value).toEqual(FULL);
  });

  it("keeps going past any failure, whatever its kind", async () => {
    const a = source("A", { bars: new Error("rejected the API key") });
    const b = source("B", { bars: [] });
    const c = source("C", { bars: FULL });

    const result = await fetchBarsWithFailover([a, b, c], "AAPL", "1Day", from, to);
    expect(result.source).toBe("C");
    expect(result.attempts.map((x) => x.provider)).toEqual(["A", "B"]);
  });

  it("skips providers that cannot serve the timeframe", async () => {
    const daily = source("DailyOnly", {
      bars: FULL,
      supports: (tf) => tf === "1Day",
    });
    const any = source("Any", { bars: FULL });

    const result = await fetchBarsWithFailover([daily, any], "AAPL", "1Min", from, to);
    expect(daily.barCalls).toBe(0);
    expect(result.source).toBe("Any");
  });

  it("skips unconfigured providers without calling them", async () => {
    const off = source("Off", { bars: FULL, configured: false });
    const on = source("On", { bars: FULL });

    const result = await fetchBarsWithFailover([off, on], "AAPL", "1Day", from, to);
    expect(off.barCalls).toBe(0);
    expect(result.source).toBe("On");
  });

  it("reports every attempt when all providers fail", async () => {
    const a = source("A", { bars: new Error("rate limit reached") });
    const b = source("B", { bars: new Error("quota exceeded") });

    const result = await fetchBarsWithFailover([a, b], "AAPL", "1Day", from, to);
    expect(result.source).toBeNull();
    expect(result.attempts).toHaveLength(2);
  });

  // Tiingo answers for a Toronto ETF with five days of a different security's
  // prices, whatever window is asked for. Taking the first non-empty response
  // charted the wrong company — worse than charting nothing.
  it("passes over a provider that barely covers the requested window", async () => {
    const thin = source("Tiingo", { bars: barsSpanning(from, 5) });
    const full = source("Yahoo Finance", { bars: barsSpanning(from, 30) });

    const result = await fetchBarsWithFailover(
      [thin, full], "XEQT", "1Day", from, monthEnd,
    );

    expect(result.source).toBe("Yahoo Finance");
    expect(result.attempts[0].error).toMatch(/covering \d+% of the window/);
  });

  // A company that listed last month genuinely has little history anywhere, and
  // its chart still has to draw.
  it("falls back to the widest partial answer when nobody covers the window", async () => {
    const thinner = source("A", { bars: barsSpanning(from, 3) });
    const wider = source("B", { bars: barsSpanning(from, 8) });

    const result = await fetchBarsWithFailover(
      [thinner, wider], "NEWCO", "1Day", from, monthEnd,
    );

    expect(result.source).toBe("B");
    expect(result.value).toHaveLength(8);
  });

  it("keeps the first provider that does cover the window", async () => {
    const full = source("A", { bars: barsSpanning(from, 30) });
    const also = source("B", { bars: barsSpanning(from, 30) });

    const result = await fetchBarsWithFailover([full, also], "SPY", "1Day", from, monthEnd);
    expect(result.source).toBe("A");
    expect(also.barCalls).toBe(0);
  });

  it("serves a repeat request from cache without touching the network", async () => {
    const a = source("A", { bars: FULL });

    await fetchBarsWithFailover([a], "AAPL", "1Day", from, to);
    await fetchBarsWithFailover([a], "AAPL", "1Day", from, to);

    expect(a.barCalls).toBe(1);
  });

  it("does not cache a total failure", async () => {
    const a = source("A", { bars: new Error("rate limit reached") });

    await fetchBarsWithFailover([a], "AAPL", "1Day", from, to);
    await fetchBarsWithFailover([a], "AAPL", "1Day", from, to);

    // Retried rather than serving a cached failure, so recovery is immediate.
    expect(a.barCalls).toBe(2);
  });
});

describe("quote failover", () => {
  it("falls through to the next provider on a rate limit", async () => {
    const a = source("A", { quote: new Error("rate limit reached") });
    const b = source("B", { quote: QUOTE });

    const result = await fetchQuoteWithFailover([a, b], "AAPL");
    expect(result.value?.price).toBe(100);
    expect(result.source).toBe("B");
  });

  it("continues past a provider that returns nothing", async () => {
    const a = source("A", { quote: null });
    const b = source("B", { quote: QUOTE });

    const result = await fetchQuoteWithFailover([a, b], "AAPL");
    expect(result.source).toBe("B");
  });

  it("asks the next provider when one has no data for the symbol", async () => {
    const usOnly = source("Twelve Data", {
      quote: new Error("Twelve Data has no data for XEQT."),
    });
    const worldwide = source("Yahoo Finance", { quote: QUOTE });

    const result = await fetchQuoteWithFailover([usOnly, worldwide], "XEQT");
    expect(result.source).toBe("Yahoo Finance");
  });

  it("returns null when no provider can answer", async () => {
    const a = source("A", { quote: null });
    const result = await fetchQuoteWithFailover([a], "AAPL");
    expect(result.value).toBeNull();
    expect(result.source).toBeNull();
  });

  it("caches a successful quote", async () => {
    const a = source("A", { quote: QUOTE });
    await fetchQuoteWithFailover([a], "AAPL");
    await fetchQuoteWithFailover([a], "AAPL");
    expect(a.quoteCalls).toBe(1);
  });

  it("keys the cache per symbol", async () => {
    const a = source("A", { quote: QUOTE });
    await fetchQuoteWithFailover([a], "AAPL");
    await fetchQuoteWithFailover([a], "MSFT");
    expect(a.quoteCalls).toBe(2);
  });
});
