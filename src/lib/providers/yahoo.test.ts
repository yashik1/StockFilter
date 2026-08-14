import { describe, expect, it } from "vitest";
import { yahooSymbol } from "./yahoo";

/**
 * Yahoo keys every non-US listing by an exchange suffix. Passing the bare
 * ticker returns nothing at all — `ATZ` is empty while `ATZ.TO` is Aritzia —
 * so a company outside SEC coverage silently produced no fundamentals even
 * with the fallback enabled.
 */
describe("Yahoo exchange suffixes", () => {
  it.each([
    ["ATZ", "TSX", "ATZ.TO"],
    ["ATZ", "NEO", "ATZ.NE"],
    ["SHOP", "TSXV", "SHOP.V"],
    ["TSCO", "LSE", "TSCO.L"],
    ["SAP", "XETRA", "SAP.DE"],
    ["7203", "TSE", "7203.T"],
    ["BHP", "ASX", "BHP.AX"],
    ["0700", "HKEX", "0700.HK"],
  ])("maps %s on %s to %s", (symbol, exchange, expected) => {
    expect(yahooSymbol(symbol, exchange)).toBe(expected);
  });

  it("leaves US listings bare", () => {
    for (const exchange of ["NYSE", "NASDAQ", "AMEX", "OTC", "BATS"]) {
      expect(yahooSymbol("AAPL", exchange)).toBe("AAPL");
    }
  });

  it("matches exchange names case-insensitively", () => {
    expect(yahooSymbol("ATZ", "tsx")).toBe("ATZ.TO");
    expect(yahooSymbol("PETR4", "Bovespa")).toBe("PETR4.SA");
  });

  it("keeps a suffix that is already present", () => {
    expect(yahooSymbol("ATZ.TO", "TSX")).toBe("ATZ.TO");
    expect(yahooSymbol("atz.to", null)).toBe("ATZ.TO");
  });

  // Guessing a suffix is worse than omitting one: a wrong guess can silently
  // return a different company's figures rather than failing.
  it("does not invent a suffix for an unknown exchange", () => {
    expect(yahooSymbol("ABC", "SOME-NEW-VENUE")).toBe("ABC");
    expect(yahooSymbol("ABC", null)).toBe("ABC");
    expect(yahooSymbol("ABC", "")).toBe("ABC");
  });

  it("upper-cases the ticker", () => {
    expect(yahooSymbol("atz", "TSX")).toBe("ATZ.TO");
  });
});
