import { describe, expect, it } from "vitest";
import { buildWarnings } from "./warnings";
import type { HealthReport } from "./health";
import type { Filing } from "../providers/types";
import type { InsiderActivity, InsiderFiling } from "../signals/insider";

/**
 * What rises to the top of a company page.
 *
 * The rules worth pinning are the exclusions. A scheduled insider sale and a
 * routine earnings 8-K both look like activity and neither is a warning; a
 * panel that reported them would train readers to ignore the one that is.
 */

const NO_INSIDER: InsiderActivity = { trades: [], pendingSales: [] };

function filing(over: Partial<Filing> = {}): Filing {
  return {
    form: "8-K",
    filedAt: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
    periodOfReport: null,
    description: null,
    url: "https://www.sec.gov/example",
    items: null,
    ...over,
  };
}

function report(over: Partial<HealthReport> = {}): HealthReport {
  return {
    score: 6,
    headline: "",
    questions: [],
    piotroski: { score: 5, maxScore: 9, signals: [], rating: "fair" as const },
    altman: { value: null, applicable: false },
    beneish: { value: null, applicable: false },
    sourceFilingUrl: null,
    fiscalYear: 2025,
    ...over,
  };
}

function sale(over: Partial<InsiderFiling> = {}): InsiderFiling {
  return {
    form: "4",
    accessionNumber: "0000000000-25-000001",
    url: "https://www.sec.gov/form4",
    filedAt: "2026-08-01",
    ownerName: "A Director",
    isOfficer: false,
    isDirector: true,
    isTenPercentOwner: false,
    officerTitle: null,
    scheduled: false,
    transactions: [
      {
        code: "S",
        label: "Sold on the open market",
        isOpenMarketTrade: true,
        direction: "disposed",
        shares: 1_000,
        pricePerShare: 100,
        value: 100_000,
        sharesOwnedAfter: 5_000,
        securityTitle: "Common Stock",
      },
    ],
    ...over,
  };
}

describe("what a company said about itself", () => {
  it("raises a restatement notice as severe", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [filing({ items: "4.02" })],
      insider: NO_INSIDER,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("severe");
    expect(warnings[0].text).toContain("cannot be relied on");
    expect(warnings[0].evidence).toContain("4.02");
    expect(warnings[0].url).toBe("https://www.sec.gov/example");
  });

  /*
    A routine results release is filed under 8-K item 2.02 by nearly every
    company every quarter. Reporting it here would bury the one filing that
    matters under four a year that do not.
  */
  it("ignores a routine earnings release", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [filing({ items: "2.02,9.01" })],
      insider: NO_INSIDER,
    });

    expect(warnings).toEqual([]);
  });

  it("picks the red flag out of a filing that also carries routine items", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [filing({ items: "2.02,4.01,9.01" })],
      insider: NO_INSIDER,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].evidence).toContain("4.01");
  });

  it("lets an old filing fall out of the window", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [
        filing({
          items: "4.02",
          filedAt: new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10),
        }),
      ],
      insider: NO_INSIDER,
    });

    expect(warnings).toEqual([]);
  });

  it("does not read item codes off a form that is not an 8-K", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [filing({ form: "10-K", items: "4.02" })],
      insider: NO_INSIDER,
    });

    expect(warnings).toEqual([]);
  });
});

describe("what the models flagged", () => {
  it("reports a Beneish flag without calling it wrongdoing", () => {
    const warnings = buildWarnings({
      report: report({
        beneish: {
          value: { m: -1.2, flagged: true, rating: "poor" as const },
          applicable: true,
        },
      }),
      filings: [],
      insider: NO_INSIDER,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("notable");
    expect(warnings[0].text).toContain("not evidence of wrongdoing");
  });

  it("reports an Altman distress zone", () => {
    const warnings = buildWarnings({
      report: report({
        altman: {
          value: {
            z: 1.1,
            zone: "distress" as const,
            variant: "manufacturing" as const,
            rating: "poor" as const,
          },
          applicable: true,
        },
      }),
      filings: [],
      insider: NO_INSIDER,
    });

    expect(warnings[0].evidence).toContain("1.10");
  });

  it("says nothing when a company is unremarkable", () => {
    expect(buildWarnings({ report: report(), filings: [], insider: NO_INSIDER })).toEqual([]);
  });
});

describe("what the people running it did", () => {
  it("reports an unscheduled open-market sale", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [],
      insider: { trades: [sale()], pendingSales: [] },
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].text).toContain("A Director");
    expect(warnings[0].evidence).toContain("$100.0K");
  });

  /*
    The distinction this panel exists to preserve. A sale under a Rule
    10b5-1 plan was arranged months in advance and carries no information
    about today — reporting it as a warning is the single most misleading
    thing an insider feed can do.
  */
  it("ignores a sale made under a pre-arranged plan", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [],
      insider: { trades: [sale({ scheduled: true })], pendingSales: [] },
    });

    expect(warnings).toEqual([]);
  });

  it("ignores a grant, which is not a trade at all", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [],
      insider: {
        trades: [
          sale({
            transactions: [
              {
                code: "A",
                label: "Was granted shares",
                isOpenMarketTrade: false,
                direction: "acquired",
                shares: 500,
                pricePerShare: null,
                value: null,
                sharesOwnedAfter: 5_500,
                securityTitle: "Common Stock",
              },
            ],
          }),
        ],
        pendingSales: [],
      },
    });

    expect(warnings).toEqual([]);
  });

  it("ignores an open-market purchase, which is not a warning", () => {
    const warnings = buildWarnings({
      report: report(),
      filings: [],
      insider: {
        trades: [
          sale({
            transactions: [
              {
                code: "P",
                label: "Bought on the open market",
                isOpenMarketTrade: true,
                direction: "acquired",
                shares: 500,
                pricePerShare: 100,
                value: 50_000,
                sharesOwnedAfter: 5_500,
                securityTitle: "Common Stock",
              },
            ],
          }),
        ],
        pendingSales: [],
      },
    });

    expect(warnings).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts what the company filed above what a model inferred", () => {
    const warnings = buildWarnings({
      report: report({
        beneish: {
          value: { m: -1.2, flagged: true, rating: "poor" as const },
          applicable: true,
        },
      }),
      filings: [filing({ items: "1.03" })],
      insider: { trades: [sale()], pendingSales: [] },
    });

    expect(warnings).toHaveLength(3);
    expect(warnings[0].level).toBe("severe");
    expect(warnings[0].text).toContain("bankruptcy");
  });
});
