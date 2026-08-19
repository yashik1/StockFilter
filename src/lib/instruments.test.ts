import { describe, expect, it } from "vitest";
import { CANADIAN_SYMBOLS, US_SYMBOLS } from "./universe";
import {
  ALL_INSTRUMENTS,
  CRYPTO,
  COMMODITIES,
  FUTURES,
  classify,
  findInstrument,
  groupByCategory,
  hasFinancialStatements,
  searchInstruments,
} from "./instruments";

/**
 * The catalogue of things that are not companies.
 *
 * What is worth pinning here is not the contents of the lists — those change
 * as contracts and coins come and go — but the properties that keep the rest
 * of the app honest: that nothing is scored which files no accounts, that a
 * cents-quoted contract is labelled as such, and that searching for "gold"
 * finds gold.
 */

describe("the catalogue itself", () => {
  it("has no duplicate symbols", () => {
    const seen = new Set<string>();
    for (const item of ALL_INSTRUMENTS) {
      expect(seen.has(item.symbol), `${item.symbol} appears twice`).toBe(false);
      seen.add(item.symbol);
    }
  });

  it("uses Yahoo notation consistently, since that is what fetches the bars", () => {
    for (const item of CRYPTO) expect(item.symbol).toMatch(/-USD$/);
    for (const item of [...COMMODITIES, ...FUTURES]) expect(item.symbol).toMatch(/=F$/);
  });

  it("gives every physical commodity a unit", () => {
    // A commodity price without its unit is unreadable: 4554 what, of what?
    for (const item of COMMODITIES) {
      expect(item.unit, `${item.symbol} has no unit`).toBeTruthy();
    }
  });

  it("names the cents-quoted contracts in their unit", () => {
    // These are the ones Yahoo returns as USX. If the unit does not say cents,
    // a reader has nothing on the page telling them the price is not dollars.
    for (const symbol of ["ZC=F", "ZW=F", "ZS=F", "ZL=F", "KC=F", "SB=F", "CT=F", "OJ=F", "LE=F", "GF=F", "HE=F"]) {
      const item = findInstrument(symbol);
      expect(item, `${symbol} is missing from the catalogue`).not.toBeNull();
      expect(item!.unit).toMatch(/cents/i);
    }
  });

  it("does not claim cents for the contracts quoted in dollars", () => {
    for (const symbol of ["GC=F", "CL=F", "NG=F", "CC=F", "ZM=F", "ES=F"]) {
      expect(findInstrument(symbol)!.unit).not.toMatch(/cents/i);
    }
  });
});

describe("classification", () => {
  it("recognises the two notations by shape alone, without a network call", () => {
    expect(classify("BTC-USD")).toBe("crypto");
    expect(classify("GC=F")).toBe("commodity");
    expect(classify("ES=F")).toBe("future");
  });

  it("classifies an unlisted symbol in a known notation rather than giving up", () => {
    // Not in the catalogue, but the suffix is unambiguous — no equity ticker
    // ends in =F, so guessing "future" beats guessing "stock".
    expect(classify("ZR=F")).toBe("future");
    expect(classify("PEPE-USD")).toBe("crypto");
  });

  it("returns null for an ordinary ticker rather than assuming", () => {
    // Null means "ask a provider", not "this is a stock". The distinction
    // matters: a wrong guess here suppresses the health report on a real
    // company, or tries to score Bitcoin.
    expect(classify("AAPL")).toBeNull();
    expect(classify("SPY")).toBeNull();
    expect(classify("")).toBeNull();
  });

  it("is case and whitespace insensitive, since these arrive from a URL", () => {
    expect(classify(" btc-usd ")).toBe("crypto");
    expect(classify("gc=f")).toBe("commodity");
  });

  it("does not mistake a hyphenated share class for a crypto pair", () => {
    // BRK-B is Berkshire's B shares, not a token priced in dollars.
    expect(classify("BRK-B")).toBeNull();
  });
});

describe("what can be scored", () => {
  it("suppresses scoring for everything in the catalogue", () => {
    for (const item of ALL_INSTRUMENTS) {
      expect(hasFinancialStatements(item.symbol), `${item.symbol}`).toBe(false);
    }
  });

  it("leaves ordinary equities scoreable", () => {
    expect(hasFinancialStatements("AAPL")).toBe(true);
    expect(hasFinancialStatements("SHOP")).toBe(true);
  });
});

describe("search", () => {
  it("finds a commodity by its plain name, which is what people type", () => {
    expect(searchInstruments("gold")[0].symbol).toBe("GC=F");
    expect(searchInstruments("oil")[0].symbol).toBe("CL=F");
    expect(searchInstruments("wheat")[0].symbol).toBe("ZW=F");
    expect(searchInstruments("coffee")[0].symbol).toBe("KC=F");
  });

  it("finds crypto by name and by bare ticker", () => {
    expect(searchInstruments("bitcoin")[0].symbol).toBe("BTC-USD");
    expect(searchInstruments("btc")[0].symbol).toBe("BTC-USD");
    expect(searchInstruments("ethereum")[0].symbol).toBe("ETH-USD");
  });

  it("ranks an exact match above a merely-containing one", () => {
    // "eth" is a prefix of Ethereum and a substring of Ethereum Classic.
    // Without ranking, the classic coin could come first.
    expect(searchInstruments("eth")[0].symbol).toBe("ETH-USD");
  });

  it("returns nothing for an empty or unmatched query", () => {
    expect(searchInstruments("")).toEqual([]);
    expect(searchInstruments("   ")).toEqual([]);
    expect(searchInstruments("zzzznotathing")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchInstruments("a", 3).length).toBeLessThanOrEqual(3);
  });
});

describe("grouping", () => {
  it("keeps categories in list order rather than alphabetising them", () => {
    // Precious metals should lead the commodities page, not "Energy",
    // because the list is ordered deliberately.
    const groups = groupByCategory(COMMODITIES);
    expect(groups[0].category).toBe("Precious metals");
    expect(groups.map((g) => g.category)).toContain("Livestock");
  });

  it("puts every instrument in exactly one group", () => {
    const groups = groupByCategory(ALL_INSTRUMENTS);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(ALL_INSTRUMENTS.length);
  });
});

/**
 * The regression that would be silent.
 *
 * classify() decides whether to fetch SEC filings at all, so a false positive
 * does not throw or log — it quietly strips the health report, the scores and
 * the filings list off a real company's page, and the page still renders. The
 * whole screening universe is checked here because that is the only way the
 * mistake would ever be noticed.
 */
describe("no real company is mistaken for a commodity or a coin", () => {
  it("leaves every symbol in the screening universe scoreable", () => {
    const universe = [...US_SYMBOLS, ...CANADIAN_SYMBOLS];
    const misread = universe.filter((s) => classify(s) !== null);
    expect(misread, `these would silently lose their health report: ${misread.join(", ")}`)
      .toEqual([]);
  });

  it("does not treat a hyphenated share class as a crypto pair", () => {
    // The crypto rule matches on a -USD suffix precisely so that these, which
    // are the common hyphen users among tickers, are untouched.
    for (const symbol of ["BRK-B", "BRK-A", "BF-B", "PBR-A", "LEN-B"]) {
      expect(classify(symbol), symbol).toBeNull();
    }
  });
});
