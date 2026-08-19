import { describe, expect, it } from "vitest";
import { money, price } from "./format";

/**
 * Labelling a figure with the currency it is actually in.
 *
 * Only dollars and Canadian dollars were handled; everything else fell through
 * to no symbol at all. SK hynix reports in won, so its revenue rendered as a
 * bare "97.15T" — ninety-seven trillion of nothing in particular — and wherever
 * the currency was not passed through, as "$97.15T", a company larger than
 * every listed company on earth combined. The real figure is ₩97 trillion,
 * about $70 billion.
 */
describe("money", () => {
  it("uses the right symbol for the currencies filers actually report in", () => {
    expect(money(97_146_675_000_000, "KRW")).toBe("₩97.15T");
    expect(money(1_234_000_000, "USD")).toBe("$1.23B");
    expect(money(1_234_000_000, "CAD")).toBe("C$1.23B");
    expect(money(1_234_000_000, "EUR")).toBe("€1.23B");
    expect(money(1_234_000_000, "GBP")).toBe("£1.23B");
    expect(money(1_234_000_000, "JPY")).toBe("¥1.23B");
  });

  // A number with no unit invites the reader to assume dollars, which is the
  // mistake worth preventing.
  it("names an unmapped currency rather than leaving the figure bare", () => {
    // PLN has no symbol in the map, unlike TWD which maps to NT$.
    const formatted = money(1_234_000_000, "PLN");

    expect(formatted).toContain("PLN");
    expect(formatted).not.toBe("1.23B");
    expect(formatted).not.toContain("$");
  });

  it("never labels a non-dollar figure with a dollar sign", () => {
    for (const code of ["KRW", "JPY", "EUR", "GBP", "INR", "PLN"]) {
      expect(money(5_000_000, code)).not.toMatch(/^\$/);
    }
  });

  it("keeps the magnitude suffixes and the sign", () => {
    expect(money(1_500, "USD")).toBe("$1.5K");
    expect(money(2_500_000, "USD")).toBe("$2.5M");
    expect(money(-3_200_000_000, "USD")).toBe("-$3.20B");
    expect(money(-97_000_000_000_000, "KRW")).toBe("-₩97.00T");
  });

  it("still returns a dash for a missing figure", () => {
    for (const v of [null, undefined, NaN, Infinity]) {
      expect(money(v as number, "KRW")).toBe("—");
    }
  });

  it("defaults to dollars, which is what most filers report in", () => {
    expect(money(1_000_000)).toBe("$1.0M");
  });
});

describe("price", () => {
  it("labels a share price in its own currency", () => {
    expect(price(175.12, "USD")).toBe("$175.12");
    expect(price(137.88, "CAD")).toBe("C$137.88");
    expect(price(85_400, "KRW")).toBe("₩85400.00");
  });

  it("names an unmapped currency", () => {
    expect(price(42.5, "PLN")).toContain("PLN");
  });
});

/**
 * Prices that are not ordinary share prices.
 *
 * Two ways a price renders as a lie rather than as missing: a token worth a
 * few millionths of a cent rounding to zero, and a contract quoted in cents
 * being read as dollars. Both produce a confident, wrong number, which is
 * worse than a dash.
 */
describe("price, for instruments that are not shares", () => {
  it("marks a cents-quoted contract as cents, not dollars", () => {
    // Wheat at 695.5 is $6.955 a bushel. Rendering "$695.50" overstates it
    // a hundredfold, and nothing on the page would contradict it.
    expect(price(695.5, "USX")).toBe("695.50¢");
    expect(price(17.64, "USX")).toBe("17.64¢");
  });

  it("handles London's pence quotes the same way", () => {
    expect(price(240.5, "GBX")).toBe("240.50p");
  });

  it("does not round a sub-cent token down to zero", () => {
    // Shiba Inu really does trade here. toFixed(2) would say "$0.00".
    expect(price(0.00000456, "USD")).toBe("$0.00000456");
    expect(price(0.07271, "USD")).toBe("$0.0727");
    expect(price(0.000629029, "USD")).toBe("$0.000629");
  });

  it("leaves ordinary prices at two places so columns line up", () => {
    expect(price(68_708.36, "USD")).toBe("$68708.36");
    expect(price(4.3, "USD")).toBe("$4.30");
    expect(price(1, "USD")).toBe("$1.00");
  });

  it("keeps the sign on a negative", () => {
    expect(price(-12.5, "USD")).toBe("$-12.50");
  });
});
