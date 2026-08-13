import { describe, expect, it } from "vitest";
import { DISPLAY_SECTORS, displaySectorFromSic } from "./sectors";
import { sectorFromSic } from "./applicability";

/**
 * These are real SIC codes taken from EDGAR submissions, so the mapping is
 * pinned against what filers actually report rather than against invented
 * examples.
 */
describe("display sector from SIC", () => {
  it.each([
    [3571, "Technology", "Apple — electronic computers"],
    [7372, "Technology", "Microsoft — prepackaged software"],
    [3674, "Technology", "Nvidia — semiconductors"],
    [6029, "Financials", "Royal Bank — commercial banks"],
    [6021, "Financials", "JPMorgan — national commercial banks"],
    [6798, "Real Estate", "Prologis — REIT"],
    [2911, "Energy", "Exxon — petroleum refining"],
    [1311, "Energy", "crude petroleum and natural gas"],
    [2834, "Health Care", "Lilly — pharmaceutical preparations"],
    [8000, "Health Care", "health services"],
    [2086, "Consumer Staples", "Coca-Cola — bottled soft drinks"],
    [5331, "Consumer Discretionary", "Walmart — variety stores"],
    [3711, "Consumer Discretionary", "Ford — motor vehicles"],
    [3531, "Industrials", "Caterpillar — construction machinery"],
    [4011, "Industrials", "Union Pacific — railroads"],
    [2810, "Materials", "Linde — industrial inorganic chemicals"],
    [4911, "Utilities", "NextEra — electric services"],
    [4813, "Communication Services", "AT&T — telephone communications"],
  ])("maps %i to %s (%s)", (sic, expected) => {
    expect(displaySectorFromSic(sic)).toBe(expected);
  });

  it("accepts the string form EDGAR returns", () => {
    expect(displaySectorFromSic("3571")).toBe("Technology");
    expect(displaySectorFromSic(" 6021 ")).toBe("Financials");
  });

  it("returns Other rather than guessing", () => {
    for (const input of [null, undefined, "", "abc", 0, -5, 9999]) {
      expect(displaySectorFromSic(input as never)).toBe("Other");
    }
  });

  it("only ever returns a known sector", () => {
    for (let sic = 100; sic <= 9999; sic += 7) {
      expect(DISPLAY_SECTORS).toContain(displaySectorFromSic(sic));
    }
  });

  // The two classifications answer different questions and must stay separate:
  // widening the scoring one would change which models get suppressed.
  it("is independent of the scoring sector", () => {
    // A REIT displays as Real Estate but is gated as real-estate for scoring.
    expect(displaySectorFromSic(6798)).toBe("Real Estate");
    expect(sectorFromSic(6798)).toBe("financial");

    // Apple displays as Technology but scores under the manufacturing models.
    expect(displaySectorFromSic(3571)).toBe("Technology");
    expect(sectorFromSic(3571)).toBe("manufacturing");
  });

  it("keeps banks out of real estate despite adjacent code ranges", () => {
    expect(displaySectorFromSic(6199)).toBe("Financials");
    expect(displaySectorFromSic(6512)).toBe("Real Estate");
  });
});
