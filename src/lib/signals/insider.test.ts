import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseForm144Xml, parseForm4Xml } from "./insider";

/**
 * Parsing real Form 4 and Form 144 filings.
 *
 * Every fixture here is an actual filing pulled from EDGAR, chosen to cover
 * the distinction this module exists to make: an open-market purchase, a sale
 * that ran on a pre-arranged schedule, and the grant/exercise/tax-withholding
 * paperwork that is not a trade at all. Numbers are checked against what the
 * raw XML actually says, not against a hand-computed expectation — this is a
 * parser, and the thing worth verifying is that it reads the document
 * correctly, not that arithmetic done twice agrees with itself.
 */

const FIXTURES = join(__dirname, "__fixtures__");
const load = (name: string) => readFileSync(join(FIXTURES, name), "utf-8");

const META = { form: "4" as const, accessionNumber: "acc-1", url: "https://example.com", filedAt: "2026-08-11" };

describe("an open-market purchase", () => {
  // Intel's CEO, Lip-Bu Tan, buying 105,263 shares at $95.00 with his own
  // money — not on a 10b5-1 plan. This is the strongest signal the whole
  // feature exists to surface, so it is worth getting exactly right.
  const filing = parseForm4Xml(load("form4-purchase.xml"), META);

  it("identifies the owner and their role", () => {
    expect(filing.ownerName).toBe("TAN LIP BU");
    expect(filing.isOfficer).toBe(true);
    expect(filing.isDirector).toBe(true);
    expect(filing.officerTitle).toBe("CEO");
  });

  it("is not marked scheduled", () => {
    // <aff10b5One>0</aff10b5One> in the raw filing.
    expect(filing.scheduled).toBe(false);
  });

  it("reads the purchase as an open-market trade, acquiring shares", () => {
    expect(filing.transactions).toHaveLength(1);
    const [tx] = filing.transactions;
    expect(tx.code).toBe("P");
    expect(tx.isOpenMarketTrade).toBe(true);
    expect(tx.direction).toBe("acquired");
  });

  it("gets the shares, price and computed value right", () => {
    const [tx] = filing.transactions;
    expect(tx.shares).toBe(105_263);
    expect(tx.pricePerShare).toBe(95);
    expect(tx.value).toBeCloseTo(105_263 * 95, 2);
    expect(tx.sharesOwnedAfter).toBe(1_314_669);
  });

  it("ignores the nonDerivativeHolding blocks alongside the transaction", () => {
    // The same filing lists two holdings (a 401(k) balance, an indirect
    // trust) with no transactionCode of their own. Counting them as
    // transactions would fabricate trades that never happened.
    expect(filing.transactions).toHaveLength(1);
  });
});

describe("a sale under a pre-arranged trading plan", () => {
  // Apple's SVP and General Counsel, selling 1,439 shares at $307.75 — about
  // $443k — under a Rule 10b5-1 plan set up in advance.
  const filing = parseForm4Xml(load("form4-scheduled-sale.xml"), META);

  it("is marked scheduled", () => {
    expect(filing.scheduled).toBe(true);
  });

  it("still reads as an open-market trade — the code does not change, the context does", () => {
    // Scheduled and open-market are two different questions. A 10b5-1 sale
    // is still a real sale at a real price; what changes is how much it says
    // about the seller's current view of the company.
    const [tx] = filing.transactions;
    expect(tx.code).toBe("S");
    expect(tx.isOpenMarketTrade).toBe(true);
    expect(tx.direction).toBe("disposed");
  });

  it("computes the sale's value correctly", () => {
    const [tx] = filing.transactions;
    expect(tx.shares).toBe(1_439);
    expect(tx.pricePerShare).toBe(307.75);
    expect(tx.value).toBeCloseTo(1_439 * 307.75, 2);
    expect(tx.sharesOwnedAfter).toBe(40_107);
  });
});

describe("grants, exercises and tax withholding — not trades", () => {
  // An RSU vesting (M, acquire, no price — options/RSUs are not bought),
  // followed by shares withheld to cover the resulting tax bill (F, dispose,
  // at that day's price). Neither is a decision to buy or sell.
  const filing = parseForm4Xml(load("form4-grant-exercise.xml"), META);

  it("unescapes the XML entity in the officer title", () => {
    // The raw filing has "&amp;" in "CT & Ops Off" — a real-world case for
    // the extractor's entity handling, not a contrived one.
    expect(filing.officerTitle).toBe("EVP, CT & Ops Off, GM Foundry");
  });

  it("reads exactly the two non-derivative transactions, not the derivative one", () => {
    // The same filing also converts RSUs in a separate derivativeTable,
    // which this module deliberately does not read — different valuation
    // mechanics, and mixing them would produce a number that means something
    // else. Three transaction-shaped blocks exist in the file; two belong here.
    expect(filing.transactions).toHaveLength(2);
  });

  it("marks the vesting and the tax withholding as not open-market trades", () => {
    for (const tx of filing.transactions) {
      expect(tx.isOpenMarketTrade, tx.code).toBe(false);
    }
  });

  it("reads the vesting with no price, and the withholding with one", () => {
    const [vested, withheld] = filing.transactions;
    expect(vested.code).toBe("M");
    expect(vested.shares).toBe(33_007);
    expect(vested.pricePerShare).toBeNull();
    expect(vested.value).toBeNull();

    expect(withheld.code).toBe("F");
    expect(withheld.shares).toBe(14_738);
    expect(withheld.pricePerShare).toBe(90.04);
    expect(withheld.direction).toBe("disposed");
  });
});

describe("a Form 144 notice of intent to sell", () => {
  const notice = parseForm144Xml(load("form144-intent-to-sell.xml"), {
    accessionNumber: "acc-2",
    url: "https://example.com",
    filedAt: "2026-08-11",
  });

  it("names the person and their relationship to the company", () => {
    expect(notice.personName).toBe("JENNIFER NEWSTEAD");
    expect(notice.relationship).toBe("Officer");
  });

  it("reads the pending sale's size", () => {
    expect(notice.units).toBe(8_632);
    expect(notice.aggregateMarketValue).toBeCloseTo(2_660_900.32, 2);
  });

  it("converts the US-format sale date to ISO", () => {
    // The raw filing has 08/11/2026 (MM/DD/YYYY) — reading it as ISO
    // directly would silently swap the month and day whenever both are
    // under 13, which is most of the time.
    expect(notice.approxSaleDate).toBe("2026-08-11");
  });

  it("reads how the shares were obtained", () => {
    expect(notice.acquiredVia).toBe("Restricted Stock Units");
  });
});

describe("a namespaced filing", () => {
  /*
    Real bug, caught by rendering against a live company rather than only
    against fixtures chosen in advance. Shopify's Form 144s are generated by
    Workiva, which prefixes every element with a namespace — <own:nameOfPerson
    ForWhoseAccountTheSecuritiesAreToBeSold> rather than the bare tag Apple's
    filing agent writes. The bug was silent: no throw, no error, just every
    field reading null, which rendered as "An insider filed notice to sell ."
    with nothing after it — worse than an empty state, since it looks like
    content that loaded and then had nothing in it.
  */
  const notice = parseForm144Xml(load("form144-namespaced.xml"), {
    accessionNumber: "acc-4",
    url: "https://example.com",
    filedAt: "2026-08-07",
  });

  it("reads every field through the namespace prefix", () => {
    expect(notice.personName).toBe("Gail Goodman");
    expect(notice.relationship).toBe("Director");
    expect(notice.units).toBe(4_000);
    expect(notice.aggregateMarketValue).toBeCloseTo(589_760, 2);
    expect(notice.approxSaleDate).toBe("2026-08-07");
    expect(notice.acquiredVia).toBe("Exercise of Options");
  });
});

describe("resilience", () => {
  it("returns a usable object from an empty document rather than throwing", () => {
    const filing = parseForm4Xml("<ownershipDocument></ownershipDocument>", META);
    expect(filing.transactions).toEqual([]);
    expect(filing.ownerName).toBe("Unknown filer");
    expect(filing.scheduled).toBe(false);
  });

  it("does the same for a Form 144 with nothing in it", () => {
    const notice = parseForm144Xml("<edgarSubmission></edgarSubmission>", {
      accessionNumber: "acc-3",
      url: "https://example.com",
      filedAt: "2026-08-11",
    });
    expect(notice.personName).toBeNull();
    expect(notice.units).toBeNull();
    expect(notice.approxSaleDate).toBeNull();
  });

  it("labels an unrecognised transaction code rather than dropping it", () => {
    const xml = `<ownershipDocument>
      <nonDerivativeTable>
        <nonDerivativeTransaction>
          <transactionCode>Z</transactionCode>
        </nonDerivativeTransaction>
      </nonDerivativeTable>
    </ownershipDocument>`;
    const filing = parseForm4Xml(xml, META);
    expect(filing.transactions).toHaveLength(1);
    expect(filing.transactions[0].isOpenMarketTrade).toBe(false);
    expect(filing.transactions[0].label).not.toBe("");
  });
});
