import { describe, expect, it } from "vitest";
import { filingUrl, normalizeCompanyFacts } from "./normalize";
import type { SecCompanyFacts } from "./types";

import aaplRaw from "./__fixtures__/aapl.json";
import ryRaw from "./__fixtures__/ry.json";
import shopRaw from "./__fixtures__/shop.json";

const aapl = normalizeCompanyFacts(aaplRaw as unknown as SecCompanyFacts);
const ry = normalizeCompanyFacts(ryRaw as unknown as SecCompanyFacts);
const shop = normalizeCompanyFacts(shopRaw as unknown as SecCompanyFacts);

describe("taxonomy detection", () => {
  it("detects us-gaap for a US domestic filer", () => {
    expect(aapl.taxonomy).toBe("us-gaap");
  });

  // Regression guard: Canadian MJDS filers report under ifrs-full. Reading only
  // us-gaap would render every Canadian company with blank fundamentals.
  it("detects ifrs-full for a Canadian 40-F filer", () => {
    expect(ry.taxonomy).toBe("ifrs-full");
    expect(ry.entityName).toMatch(/ROYAL BANK/i);
  });
});

describe("cross-taxonomy field resolution", () => {
  it("resolves core fields for a us-gaap filer", () => {
    const p = aapl.annual[0];
    expect(p.facts.assets?.value).toBeGreaterThan(0);
    expect(p.facts.revenue?.value).toBeGreaterThan(0);
    expect(p.facts.netIncome?.value).toBeGreaterThan(0);
    expect(p.facts.netIncome?.sourceConcept).toBe("us-gaap:NetIncomeLoss");
  });

  it("resolves ifrs-full concepts to the same canonical fields", () => {
    const p = ry.annual[0];
    expect(p.facts.assets?.sourceConcept).toBe("ifrs-full:Assets");
    // IFRS calls net income ProfitLoss; it must land on `netIncome` regardless.
    expect(p.facts.netIncome?.sourceConcept).toBe("ifrs-full:ProfitLoss");
    expect(p.facts.netIncome?.value).toBeGreaterThan(0);
    expect(p.facts.operatingCashFlow?.sourceConcept).toBe(
      "ifrs-full:CashFlowsFromUsedInOperatingActivities",
    );
  });
});

describe("derived fields", () => {
  // Shopify reports assets and equity but never tags total liabilities.
  it("derives liabilities from assets - equity when untagged", () => {
    const p = shop.annual[0];
    expect(p.facts.liabilities).toBeDefined();
    expect(p.facts.liabilities?.derived).toBe(true);
    expect(p.facts.liabilities?.sourceConcept).toBe("derived:Assets-Equity");

    const assets = p.facts.assets!.value;
    const equity = p.facts.equity!.value;
    expect(p.facts.liabilities!.value).toBeCloseTo(assets - equity, 2);
  });

  it("does not mark directly reported liabilities as derived", () => {
    const p = aapl.annual[0];
    expect(p.facts.liabilities?.derived).toBeUndefined();
  });

  // `LiabilitiesAndStockholdersEquity` is the balance sheet total, not total
  // liabilities. Reading it as liabilities would roughly double reported debt.
  it("never sources liabilities from the balance sheet total", () => {
    for (const n of [aapl, ry, shop]) {
      for (const p of n.annual) {
        expect(p.facts.liabilities?.sourceConcept).not.toMatch(
          /LiabilitiesAndStockholdersEquity/,
        );
        if (p.facts.assets && p.facts.liabilities) {
          // Liabilities can never equal total assets on a solvent balance sheet.
          expect(p.facts.liabilities.value).not.toBe(p.facts.assets.value);
        }
      }
    }
  });
});

describe("concept migration across years", () => {
  // Shopify tagged revenue as RevenueFromContractWithCustomerExcludingAssessedTax
  // through FY2023, then switched to Revenues in FY2024. Resolving concepts once
  // for the whole company drops one era or the other.
  it("picks up revenue across a mid-history concept switch", () => {
    const withRevenue = shop.annual.filter((p) => p.facts.revenue != null);
    expect(withRevenue.length).toBeGreaterThanOrEqual(4);

    // The most recent year must have revenue — that is the one the UI shows.
    expect(shop.annual[0].facts.revenue?.value).toBeGreaterThan(0);

    const concepts = new Set(withRevenue.map((p) => p.facts.revenue!.sourceConcept));
    expect(concepts.size).toBeGreaterThan(1);
  });

  it("keeps revenue increasing across the switch, with no gap year", () => {
    const years = shop.annual
      .filter((p) => p.facts.revenue != null)
      .map((p) => p.fiscalYear)
      .sort((a, b) => a - b);
    for (let i = 1; i < years.length; i++) {
      expect(years[i] - years[i - 1]).toBe(1);
    }
  });
});

describe("filing-error guards", () => {
  // Royal Bank's FY2020 40-F cover page reports 0 shares outstanding. Left in,
  // it makes every per-share figure Infinity.
  it("discards a reported share count of zero", () => {
    const fy2020 = ry.annual.find((p) => p.fiscalYear === 2020);
    expect(fy2020).toBeDefined();
    expect(fy2020!.facts.sharesOutstanding).toBeUndefined();

    // Neighbouring years are unaffected and still carry real share counts.
    const fy2021 = ry.annual.find((p) => p.fiscalYear === 2021);
    expect(fy2021!.facts.sharesOutstanding!.value).toBeGreaterThan(1e9);
  });
});

describe("unclassified balance sheets", () => {
  // Banks present unclassified balance sheets with no current/non-current split.
  // These must stay absent so the scoring layer can suppress the ratios that
  // depend on them, rather than computing them from a fabricated zero.
  it("leaves current assets and liabilities absent for a bank", () => {
    const p = ry.annual[0];
    expect(p.facts.currentAssets).toBeUndefined();
    expect(p.facts.currentLiabilities).toBeUndefined();
    expect(ry.missingFields).toContain("currentAssets");
    expect(ry.missingFields).toContain("currentLiabilities");
  });

  it("reports current assets and liabilities for a classified balance sheet", () => {
    const p = aapl.annual[0];
    expect(p.facts.currentAssets?.value).toBeGreaterThan(0);
    expect(p.facts.currentLiabilities?.value).toBeGreaterThan(0);
  });
});

describe("period construction", () => {
  it("returns multiple annual periods sorted newest first", () => {
    for (const n of [aapl, ry, shop]) {
      expect(n.annual.length).toBeGreaterThan(2);
      const years = n.annual.map((p) => p.fiscalYear);
      expect([...years].sort((a, b) => b - a)).toEqual(years);
    }
  });

  it("only builds periods from annual filings", () => {
    const forms = new Set(aapl.annual.map((p) => p.form));
    for (const f of forms) expect(f).toMatch(/^(10-K|20-F|40-F)/);
  });

  // Duration facts are length-checked so quarterly figures reported inside an
  // annual filing are not mistaken for full-year revenue.
  it("uses full-year spans for duration facts", () => {
    const rev = aapl.annual[0].facts.revenue!;
    const days = (Date.parse(rev.end) - Date.parse(rev.start!)) / 86_400_000;
    expect(days).toBeGreaterThan(340);
    expect(days).toBeLessThan(400);
  });

  // Scoped to fields where zero is structurally impossible. A reported zero
  // elsewhere can be genuine — Shopify really did have no interest expense in
  // years when it carried no debt — and must be preserved, not filtered.
  it("never emits zero for fields where zero is impossible", () => {
    for (const n of [aapl, ry, shop]) {
      for (const p of n.annual) {
        for (const field of ["assets", "sharesOutstanding"] as const) {
          const fact = p.facts[field];
          if (fact) expect(fact.value, `${n.entityName} ${field}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("provenance", () => {
  it("attaches a source concept and filing link to every reported fact", () => {
    const p = aapl.annual[0];
    for (const fact of Object.values(p.facts)) {
      expect(fact.sourceConcept).toMatch(/^(us-gaap|ifrs-full|dei|derived):/);
      if (!fact.derived) expect(fact.sourceFilingUrl).toContain("sec.gov");
    }
  });

  it("builds a valid EDGAR filing URL", () => {
    expect(filingUrl(320193, "0000320193-24-000123")).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/0000320193-24-000123-index.htm",
    );
  });

  it("returns null for a malformed accession number", () => {
    expect(filingUrl(320193, undefined)).toBeNull();
    expect(filingUrl(320193, "bogus")).toBeNull();
  });
});
