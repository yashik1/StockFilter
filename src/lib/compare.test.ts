import { describe, expect, it } from "vitest";
import { parseSymbols, resolveType, MAX_COMPARE } from "./compare";

/**
 * Fund detection has to work with no API key, because the free stack has none
 * for classification. The values below are the real ones EDGAR returns:
 * Apple is "operating" with SIC 3571, QQQ is "investment", and SPY is "other"
 * with no SIC and a 404 for its financial facts.
 */
describe("instrument classification", () => {
  it("treats anything with real statements as a company", () => {
    expect(resolveType("etf", true, "operating", "3571")).toBe("stock");
    expect(resolveType("unknown", true, null, null)).toBe("stock");
  });

  it("identifies a fund from EDGAR's investment entity type", () => {
    expect(resolveType("unknown", false, "investment", null)).toBe("etf");
  });

  it("identifies a trust with no statements and no SIC as a fund", () => {
    // SPY's exact shape.
    expect(resolveType("unknown", false, "other", null)).toBe("etf");
  });

  it("trusts the provider label when EDGAR knows nothing", () => {
    expect(resolveType("etf", false, null, null)).toBe("etf");
  });

  // An operating company that simply has not filed XBRL yet must not be
  // mislabelled a fund — that would suppress scoring for a real business.
  it("does not call an operating company a fund", () => {
    expect(resolveType("unknown", false, "operating", "3571")).toBe("unknown");
  });

  it("returns unknown rather than guessing", () => {
    expect(resolveType("unknown", false, null, null)).toBe("unknown");
    expect(resolveType("stock", false, null, null)).toBe("unknown");
  });
});

describe("symbol parsing", () => {
  it("splits on commas and whitespace, and upper-cases", () => {
    expect(parseSymbols("aapl, msft  nvda")).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("ignores empty entries", () => {
    expect(parseSymbols("AAPL,,  ,MSFT")).toEqual(["AAPL", "MSFT"]);
  });

  it("caps the list so one request cannot fan out indefinitely", () => {
    const many = parseSymbols("A,B,C,D,E,F,G,H");
    expect(many).toHaveLength(MAX_COMPARE);
  });

  it("handles an absent parameter", () => {
    expect(parseSymbols(undefined)).toEqual([]);
    expect(parseSymbols("")).toEqual([]);
  });

  it("accepts a repeated query parameter", () => {
    expect(parseSymbols(["AAPL", "MSFT"])).toEqual(["AAPL", "MSFT"]);
  });
});
