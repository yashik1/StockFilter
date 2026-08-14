import { describe, expect, it } from "vitest";
import { businessFromSic, buildBusinessSummary } from "./business";
import { normalizeCompanyFacts } from "../fundamentals/normalize";
import type { SecCompanyFacts } from "../fundamentals/types";

import aaplRaw from "../fundamentals/__fixtures__/aapl.json";
import ryRaw from "../fundamentals/__fixtures__/ry.json";

const aapl = normalizeCompanyFacts(aaplRaw as unknown as SecCompanyFacts);
const ry = normalizeCompanyFacts(ryRaw as unknown as SecCompanyFacts);

/**
 * A newcomer needs the business before the ratios — debt figures mean nothing
 * until you know whether you are reading about a bank or a shoemaker. These
 * pin the translation from the SEC's own classification into plain words.
 */
describe("what the company does", () => {
  it.each([
    [3571, "makes computers and computing hardware"],
    [7372, "makes and sells software and computing services"],
    [3674, "designs and makes computer chips"],
    [6022, "takes deposits and lends money"],
    [6311, "sells insurance"],
    [2834, "develops and makes medicines"],
    [5331, "runs general merchandise and department stores"],
    [4911, "supplies electricity, gas or water"],
    [1311, "drills for oil and natural gas"],
    [6798, "owns income-producing property as a REIT"],
  ])("translates SIC %i", (sic, expected) => {
    expect(businessFromSic(sic)).toBe(expected);
  });

  it("returns null rather than guessing at an unmapped code", () => {
    for (const input of [null, undefined, "", "abc", 0, 9999]) {
      expect(businessFromSic(input as never)).toBeNull();
    }
  });

  it("accepts the string form EDGAR returns", () => {
    expect(businessFromSic("3571")).toBe("makes computers and computing hardware");
  });
});

describe("business summary", () => {
  it("opens with what the company does, then its size", () => {
    const s = buildBusinessSummary("Apple Inc.", "3571", aapl)!;
    expect(s.sentence).toMatch(/^Apple makes computers/);
    expect(s.sentence).toContain("one of the largest companies");
    expect(s.sentence).toMatch(/cents is left as profit/);
  });

  it("describes a bank as lending rather than manufacturing", () => {
    const s = buildBusinessSummary("Royal Bank of Canada", "6022", ry)!;
    expect(s.sentence).toContain("takes deposits and lends money");
  });

  it("drops legal suffixes so the sentence reads naturally", () => {
    const s = buildBusinessSummary("Apple Inc.", "3571", aapl)!;
    expect(s.sentence).not.toContain("Apple Inc. makes");
  });

  it("labels amounts in the filing's own currency", () => {
    const s = buildBusinessSummary("Aritzia", "5600", aapl, "CAD")!;
    expect(s.sentence).toContain("C$");
  });

  // Claiming a company "sells iPhones" would be inventing a fact no data source
  // here provides, and a newcomer would take it at face value.
  it("never asserts specific products", () => {
    const s = buildBusinessSummary("Apple Inc.", "3571", aapl)!;
    expect(s.sentence).not.toMatch(/iPhone|Mac|iPad|product line|flagship/i);
  });

  it("returns null when there is nothing to say", () => {
    const empty = { cik: "0", entityName: "X", taxonomy: "us-gaap" as const, annual: [], missingFields: [] };
    expect(buildBusinessSummary("X", null, empty)).toBeNull();
  });

  it("still describes the business when figures are missing", () => {
    const empty = { cik: "0", entityName: "X Corp", taxonomy: "us-gaap" as const, annual: [], missingFields: [] };
    const s = buildBusinessSummary("X Corp", "6022", empty);
    expect(s?.sentence).toContain("takes deposits and lends money");
  });
});
