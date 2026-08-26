import { describe, expect, it } from "vitest";
import { __nameTesting } from "./sec-edgar";

const { deShout } = __nameTesting;

/**
 * De-shouting the SEC ticker map.
 *
 * `company_tickers.json` is inconsistently cased — "Apple Inc." sits beside
 * "MICROSOFT CORP" in the same file — and these strings now lead the page
 * title and the share card, where a name in full capitals reads as a
 * rendering fault rather than as emphasis.
 */

describe("names the SEC shouted", () => {
  it("title-cases an all-capitals name", () => {
    expect(deShout("MICROSOFT CORP")).toBe("Microsoft Corp");
    expect(deShout("AMAZON COM INC")).toBe("Amazon Com Inc");
    expect(deShout("FRANCO NEVADA CORP")).toBe("Franco Nevada Corp");
  });

  /*
    The important half. A name the SEC already cased properly must come
    through untouched: "de-correcting" Apple Inc. to "Apple inc." would make
    the common case worse to fix the rare one.
  */
  it("leaves a name that already has lowercase alone", () => {
    expect(deShout("Apple Inc.")).toBe("Apple Inc.");
    expect(deShout("Alphabet Inc.")).toBe("Alphabet Inc.");
    expect(deShout("lululemon athletica inc.")).toBe("lululemon athletica inc.");
  });

  /*
    Short vowel-less tokens are initialisms, not words. Title-casing them
    produces "Pnc Financial" and "Amc Entertainment", which is a different
    kind of wrong from the problem being fixed.
  */
  it("keeps short initialisms in capitals", () => {
    expect(deShout("PNC FINANCIAL SERVICES GROUP")).toBe("PNC Financial Services Group");
    expect(deShout("AMC ENTERTAINMENT HOLDINGS")).toBe("AMC Entertainment Holdings");
    expect(deShout("CSX CORP")).toBe("CSX Corp");
  });

  it("preserves the spacing it was given", () => {
    expect(deShout("BERKSHIRE  HATHAWAY INC")).toBe("Berkshire  Hathaway Inc");
  });

  it("handles punctuation and digits without dropping them", () => {
    expect(deShout("3M CO")).toBe("3M Co");
    // Three letters around an ampersand, so it reads as the initialism it is.
    expect(deShout("AT&T INC.")).toBe("AT&T Inc.");
  });

  it("returns an empty string unchanged", () => {
    expect(deShout("")).toBe("");
  });
});
