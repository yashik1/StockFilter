import { beforeEach, describe, expect, it } from "vitest";
import { clearPriceCache, fetchNewsWithFailover, type NewsSource } from "./failover";
import type { NewsItem } from "./types";

/**
 * Failover for headlines.
 *
 * News was the last single-source dependency in the app. When Finnhub began
 * refusing the key the panel simply went blank, while prices on the same page
 * carried on through four providers — and the blank panel then blamed a missing
 * key, which was the one thing that was not wrong.
 */

const article = (id: string): NewsItem => ({
  id,
  headline: `Headline ${id}`,
  summary: null,
  source: "Test",
  url: `https://example.com/${id}`,
  publishedAt: "2026-08-13T12:00:00Z",
  imageUrl: null,
});

function source(
  name: string,
  behaviour: { news?: NewsItem[] | Error; configured?: boolean },
): NewsSource & { calls: number } {
  const s = {
    name,
    calls: 0,
    isConfigured: () => behaviour.configured ?? true,
    async getNews() {
      s.calls++;
      if (behaviour.news instanceof Error) throw behaviour.news;
      return behaviour.news ?? [];
    },
  };
  return s;
}

beforeEach(() => clearPriceCache());

describe("news failover", () => {
  it("uses the first source with anything to say", async () => {
    const a = source("Finnhub", { news: [article("a")] });
    const b = source("Yahoo Finance", { news: [article("b")] });

    const result = await fetchNewsWithFailover([a, b], "AAPL");
    expect(result.source).toBe("Finnhub");
    expect(b.calls).toBe(0);
  });

  // The exact failure that emptied the panel on the live deployment.
  it("falls through when the first source refuses the key", async () => {
    const refused = source("Finnhub", {
      news: new Error("Finnhub rejected the API key."),
    });
    const backup = source("Yahoo Finance", { news: [article("b")] });

    const result = await fetchNewsWithFailover([refused, backup], "AMAT");

    expect(result.value).toHaveLength(1);
    expect(result.source).toBe("Yahoo Finance");
    expect(result.attempts[0]).toMatchObject({ provider: "Finnhub" });
  });

  it("skips an unconfigured source without calling it", async () => {
    const off = source("Yahoo Finance", { news: [article("a")], configured: false });
    const on = source("SEC EDGAR", { news: [article("b")] });

    const result = await fetchNewsWithFailover([off, on], "AAPL");
    expect(off.calls).toBe(0);
    expect(result.source).toBe("SEC EDGAR");
  });

  // Why EDGAR is last in the real chain: it needs no key, so it cannot be
  // refused, and a US filer always has filings.
  it("reaches the keyless source when both keyed ones fail", async () => {
    const a = source("Finnhub", { news: new Error("rejected") });
    const b = source("Yahoo Finance", { news: [], configured: false });
    const edgar = source("SEC EDGAR", { news: [article("8k")] });

    const result = await fetchNewsWithFailover([a, b, edgar], "AAPL");
    expect(result.source).toBe("SEC EDGAR");
    expect(result.value).toHaveLength(1);
  });

  it("reports every attempt when nobody has anything", async () => {
    const a = source("Finnhub", { news: [] });
    const b = source("SEC EDGAR", { news: [] });

    const result = await fetchNewsWithFailover([a, b], "OBSCURE");
    expect(result.value).toEqual([]);
    expect(result.source).toBeNull();
    expect(result.attempts).toHaveLength(2);
  });

  it("serves a repeat request from cache", async () => {
    const a = source("Finnhub", { news: [article("a")] });

    await fetchNewsWithFailover([a], "AAPL");
    await fetchNewsWithFailover([a], "AAPL");

    expect(a.calls).toBe(1);
  });

  it("does not cache a total failure, so recovery is immediate", async () => {
    const a = source("Finnhub", { news: new Error("rejected") });

    await fetchNewsWithFailover([a], "AAPL");
    await fetchNewsWithFailover([a], "AAPL");

    expect(a.calls).toBe(2);
  });
});
