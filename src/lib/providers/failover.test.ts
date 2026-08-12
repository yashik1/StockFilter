import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPriceCache,
  fetchBarsWithFailover,
  fetchQuoteWithFailover,
  isRetryable,
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

const from = new Date("2024-01-01T00:00:00Z");
const to = new Date("2024-02-01T00:00:00Z");

beforeEach(() => clearPriceCache());

describe("retryable classification", () => {
  it("treats limits and transport faults as retryable", () => {
    for (const m of [
      "Twelve Data rate limit reached",
      "quota exceeded",
      "You have run out of API credits",
      "HTTP 429",
      "fetch failed",
      "ETIMEDOUT",
    ]) {
      expect(isRetryable(m), m).toBe(true);
    }
  });

  it("does not retry a genuine data or auth problem", () => {
    for (const m of ["Twelve Data has no data for XYZ", "rejected the API key", "HTTP 500"]) {
      expect(isRetryable(m), m).toBe(false);
    }
  });
});

describe("bars failover", () => {
  it("uses the first provider that answers", async () => {
    const a = source("A", { bars: [BAR] });
    const b = source("B", { bars: [BAR] });

    const result = await fetchBarsWithFailover([a, b], "AAPL", "1Day", from, to);
    expect(result.source).toBe("A");
    expect(b.barCalls).toBe(0);
  });

  // The whole point of the chain.
  it("falls through when the first provider is rate limited", async () => {
    const a = source("A", { bars: new Error("Twelve Data rate limit reached") });
    const b = source("B", { bars: [BAR] });

    const result = await fetchBarsWithFailover([a, b], "AAPL", "1Day", from, to);
    expect(result.value).toEqual([BAR]);
    expect(result.source).toBe("B");
    expect(result.attempts[0]).toMatchObject({ provider: "A" });
  });

  // A bad key would fail on every provider, so burning the rest achieves
  // nothing except consuming their quotas too.
  it("stops on a non-retryable failure", async () => {
    const a = source("A", { bars: new Error("rejected the API key") });
    const b = source("B", { bars: [BAR] });

    const result = await fetchBarsWithFailover([a, b], "AAPL", "1Day", from, to);
    expect(result.value).toEqual([]);
    expect(b.barCalls).toBe(0);
  });

  it("skips providers that cannot serve the timeframe", async () => {
    const daily = source("DailyOnly", {
      bars: [BAR],
      supports: (tf) => tf === "1Day",
    });
    const any = source("Any", { bars: [BAR] });

    const result = await fetchBarsWithFailover([daily, any], "AAPL", "1Min", from, to);
    expect(daily.barCalls).toBe(0);
    expect(result.source).toBe("Any");
  });

  it("skips unconfigured providers without calling them", async () => {
    const off = source("Off", { bars: [BAR], configured: false });
    const on = source("On", { bars: [BAR] });

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

  it("serves a repeat request from cache without touching the network", async () => {
    const a = source("A", { bars: [BAR] });

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
