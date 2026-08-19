import { describe, expect, it } from "vitest";
import { describeEightK, describeItem } from "./eight-k-items";

/**
 * Decoding what an 8-K was about.
 *
 * The behaviour worth pinning is not the wording of any one label — those can
 * be reworded — but that the significant items are recognised as significant,
 * that paperwork never becomes the headline, and that an unmapped code
 * degrades to the old generic sentence instead of to a blank.
 */

describe("the accounting red flags", () => {
  // These are the reason the map exists. The app scores accounting quality
  // with Beneish, and 4.02 is a company stating outright what that model can
  // only infer from the numbers.
  it("treats a non-reliance filing as a red flag and says what it means", () => {
    const item = describeItem("4.02")!;
    expect(item.severity).toBe("red-flag");
    expect(item.label).toMatch(/cannot be relied on/i);
  });

  it("treats an auditor change as a red flag", () => {
    expect(describeItem("4.01")!.severity).toBe("red-flag");
  });

  it("flags bankruptcy, delisting and impairment too", () => {
    for (const code of ["1.03", "3.01", "2.06", "2.04"]) {
      expect(describeItem(code)!.severity, code).toBe("red-flag");
    }
  });

  it("does not inflate a routine earnings release", () => {
    // 2.02 is the most common 8-K there is. Marking it notable would make the
    // flag meaningless by making it constant.
    expect(describeItem("2.02")!.severity).toBe("routine");
  });
});

describe("choosing the headline", () => {
  it("leads with the most significant item, not the lowest-numbered one", () => {
    // Filings list items numerically, so an earnings release plus an officer
    // departure puts 2.02 first — but the departure is the news.
    const summary = describeEightK("2.02,5.02,9.01");
    expect(summary.headline).toMatch(/leave or join/i);
    expect(summary.severity).toBe("notable");
  });

  it("never makes the exhibits note the headline", () => {
    // 9.01 rides along on most 8-Ks and means only "documents attached".
    const summary = describeEightK("2.02,9.01");
    expect(summary.headline).toMatch(/results/i);
  });

  it("falls back to the exhibits note only when it is genuinely all there is", () => {
    const summary = describeEightK("9.01");
    expect(summary.items).toHaveLength(1);
    expect(summary.headline).toMatch(/exhibits/i);
  });

  it("keeps every recognised item, not just the headline one", () => {
    expect(describeEightK("2.02,5.02,9.01").items).toHaveLength(3);
  });

  it("tolerates the whitespace real filings contain", () => {
    expect(describeEightK("2.02, 5.02").items).toHaveLength(2);
  });
});

describe("when the map does not know", () => {
  it("degrades to the old generic sentence rather than a blank", () => {
    // The SEC adds items. An unmapped one must not produce an empty headline,
    // which would read as a rendering bug rather than as a filing.
    const summary = describeEightK("6.03");
    expect(summary.headline).toBe("The company reported a major event");
    expect(summary.items).toEqual([]);
  });

  it("does the same for a missing or empty item list", () => {
    for (const value of [null, undefined, ""]) {
      expect(describeEightK(value).headline).toBe("The company reported a major event");
    }
  });

  it("keeps the recognised half when only some codes are known", () => {
    const summary = describeEightK("5.02,6.03");
    expect(summary.items).toHaveLength(1);
    expect(summary.headline).toMatch(/leave or join/i);
  });
});
