import { afterEach, describe, expect, it, vi } from "vitest";
import { getShortInterest, withOwnership, type ShortInterest } from "./short-interest";

/**
 * Reading FINRA's fortnightly short interest report.
 *
 * The cases that matter are about picking the right row and refusing the wrong
 * one. FINRA's API will not sort a result unless the settlement date is given
 * as an exact filter — which is the thing being looked for — so the newest
 * report has to be found in code, and a bug there would show a reader a
 * position from two months ago as the current one.
 */

/** One row in the shape FINRA returns. */
const row = (settlementDate: string, over: Record<string, unknown> = {}) => ({
  symbolCode: "AAPL",
  settlementDate,
  currentShortPositionQuantity: 116_327_753,
  previousShortPositionQuantity: 141_606_163,
  daysToCoverQuantity: 2.42,
  ...over,
});

function respondWith(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading the latest report", () => {
  it("takes the figures from the newest settlement date, not the first row", async () => {
    // Deliberately out of order: the API returns partition order, not recency.
    respondWith([
      row("2026-07-15", { currentShortPositionQuantity: 146_547_784 }),
      row("2026-08-14", { currentShortPositionQuantity: 116_327_753 }),
      row("2026-07-31", { currentShortPositionQuantity: 141_606_163 }),
    ]);

    const s = await getShortInterest("AAPL");

    expect(s?.settlementDate).toBe("2026-08-14");
    expect(s?.shares).toBe(116_327_753);
  });

  it("works out the change against the previous report", async () => {
    respondWith([row("2026-08-14")]);

    const s = await getShortInterest("AAPL");
    // 116,327,753 against 141,606,163 is a fall of about 17.9%.
    expect(s?.change).toBeCloseTo(-0.1785, 3);
  });

  it("reports days to cover as FINRA published it", async () => {
    respondWith([row("2026-08-14")]);
    expect((await getShortInterest("AAPL"))?.daysToCover).toBe(2.42);
  });

  it("asks only for recent reports, and filters on the symbol", async () => {
    respondWith([row("2026-08-14")]);
    await getShortInterest("aapl");

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.compareFilters[0]).toMatchObject({
      fieldName: "symbolCode",
      fieldValue: "AAPL",
      compareType: "EQUAL",
    });
    // Without a settlement-date filter the API returns the symbol's entire
    // history — six years of rows to obtain one.
    expect(body.dateRangeFilters[0].fieldName).toBe("settlementDate");
  });
});

describe("when there is nothing to report", () => {
  /*
    Null is the ordinary answer, not a failure. FINRA covers US
    exchange-listed equities, so a Toronto listing or a company that listed
    last month legitimately has nothing here.
  */
  it("says nothing for a symbol FINRA does not cover", async () => {
    respondWith([]);
    expect(await getShortInterest("ATZ.TO")).toBeNull();
  });

  it("says nothing when the request fails", async () => {
    respondWith({ statusCode: 400 }, false);
    expect(await getShortInterest("AAPL")).toBeNull();
  });

  it("says nothing when the payload is not the list it should be", async () => {
    respondWith({ statusCode: 500, message: "upstream" });
    expect(await getShortInterest("AAPL")).toBeNull();
  });

  it("skips rows with no position figure rather than reporting a blank one", async () => {
    respondWith([
      row("2026-08-14", { currentShortPositionQuantity: null }),
      row("2026-07-31", { currentShortPositionQuantity: 141_606_163 }),
    ]);

    const s = await getShortInterest("AAPL");
    expect(s?.settlementDate).toBe("2026-07-31");
  });

  it("has no change to report on a first appearance", async () => {
    respondWith([row("2026-08-14", { previousShortPositionQuantity: null })]);

    const s = await getShortInterest("AAPL");
    expect(s?.change).toBeNull();
    expect(s?.shares).toBe(116_327_753);
  });
});

describe("expressing it as a share of the company", () => {
  const base: ShortInterest = {
    shares: 100,
    previousShares: 80,
    change: 0.25,
    percentOfShares: null,
    daysToCover: 2,
    settlementDate: "2026-08-14",
  };

  it("divides the position by the share count", () => {
    expect(withOwnership(base, 1_000)?.percentOfShares).toBeCloseTo(0.1, 6);
  });

  /*
    A percentage of an unknown denominator is not a number. The panel falls
    back to showing the raw share count, which is at least true.
  */
  it("leaves it blank rather than guessing when the share count is unknown", () => {
    for (const shares of [null, 0, -5]) {
      expect(withOwnership(base, shares)?.percentOfShares).toBeNull();
    }
  });

  it("passes nothing through as nothing", () => {
    expect(withOwnership(null, 1_000)).toBeNull();
  });
});
