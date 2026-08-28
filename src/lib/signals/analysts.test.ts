import { describe, expect, it } from "vitest";
import {
  parseEodhdAnalystRatings,
  parseFinnhubRecommendations,
  targetGap,
} from "./analysts";

/**
 * Reading published analyst ratings.
 *
 * Both sources return an opinion count that is easy to get subtly wrong: one
 * publishes a fresh row every month and keeps the old ones, the other returns
 * its numbers as strings. Either mistake produces a plausible-looking total
 * that is not the number of analysts covering the company.
 */

const month = (period: string, over: Record<string, number> = {}) => ({
  period,
  strongBuy: 13,
  buy: 18,
  hold: 11,
  sell: 2,
  strongSell: 0,
  ...over,
});

describe("Finnhub recommendation trends", () => {
  it("counts the analysts in each bucket", () => {
    const view = parseFinnhubRecommendations([month("2026-08-01")]);

    expect(view?.strongBuy).toBe(13);
    expect(view?.hold).toBe(11);
    expect(view?.total).toBe(44);
  });

  /*
    The endpoint returns one row per month and keeps the history. Summing them
    would report several hundred analysts covering a company that has
    forty-four, by counting the same people once for every month they have
    held a view.
  */
  it("uses only the newest month, not every month on file", () => {
    const view = parseFinnhubRecommendations([
      month("2026-06-01", { strongBuy: 1, buy: 1, hold: 1, sell: 1, strongSell: 1 }),
      month("2026-08-01"),
      month("2026-07-01", { strongBuy: 2, buy: 2, hold: 2, sell: 2, strongSell: 2 }),
    ]);

    expect(view?.asOf).toBe("2026-08-01");
    expect(view?.total).toBe(44);
  });

  /*
    Price targets moved to Finnhub's paid plans, so the free tier serves the
    distribution alone. Null here lets the panel drop the target block rather
    than render an empty row.
  */
  it("reports no price target, which the free tier does not serve", () => {
    const view = parseFinnhubRecommendations([month("2026-08-01")]);

    expect(view?.targetPrice).toBeNull();
    expect(view?.source).toBe("Finnhub");
  });

  it("says nothing when nobody covers the company", () => {
    expect(parseFinnhubRecommendations([])).toBeNull();
    expect(
      parseFinnhubRecommendations([
        month("2026-08-01", { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }),
      ]),
    ).toBeNull();
  });

  it("says nothing when the payload is not the list it should be", () => {
    expect(parseFinnhubRecommendations(null)).toBeNull();
    expect(parseFinnhubRecommendations({ error: "no access" })).toBeNull();
    expect(parseFinnhubRecommendations([{ symbol: "AAPL" }])).toBeNull();
  });
});

describe("EODHD analyst ratings", () => {
  /*
    EODHD returns these as strings often enough that a naive read produces
    "13182" from concatenation rather than 44 from addition.
  */
  it("reads counts that arrive as strings", () => {
    const view = parseEodhdAnalystRatings({
      StrongBuy: "13",
      Buy: "18",
      Hold: "11",
      Sell: "2",
      StrongSell: "0",
      TargetPrice: "324.45",
    });

    expect(view?.total).toBe(44);
    expect(view?.targetPrice).toBeCloseTo(324.45, 2);
  });

  /*
    A single consensus target is published without the individual estimates
    behind it. Reporting low and high as equal to the average would invent an
    agreement the payload does not evidence.
  */
  it("claims no range when only an average was published", () => {
    const view = parseEodhdAnalystRatings({ Buy: 10, TargetPrice: 100 });

    expect(view?.targetPrice).toBe(100);
    expect(view?.targetLow).toBeNull();
    expect(view?.targetHigh).toBeNull();
  });

  it("treats a missing or nonsensical target as no target", () => {
    for (const target of [undefined, null, 0, -5, "n/a"]) {
      const view = parseEodhdAnalystRatings({ Buy: 10, TargetPrice: target as never });
      expect(view?.targetPrice).toBeNull();
    }
  });

  it("says nothing when the block is absent", () => {
    expect(parseEodhdAnalystRatings(null)).toBeNull();
    expect(parseEodhdAnalystRatings(undefined)).toBeNull();
    expect(parseEodhdAnalystRatings({})).toBeNull();
  });
});

describe("the gap to today's price", () => {
  const view = parseEodhdAnalystRatings({ Buy: 10, TargetPrice: 120 })!;

  it("measures the target against the current price", () => {
    expect(targetGap(view, 100)).toBeCloseTo(0.2, 6);
  });

  it("goes negative when analysts publish below the market", () => {
    expect(targetGap(view, 150)).toBeCloseTo(-0.2, 6);
  });

  it("claims nothing without both halves of the comparison", () => {
    expect(targetGap(view, null)).toBeNull();
    expect(targetGap(view, 0)).toBeNull();
    expect(targetGap(parseFinnhubRecommendations([{ period: "2026-08-01", buy: 5 }])!, 100)).toBeNull();
  });
});
