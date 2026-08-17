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
