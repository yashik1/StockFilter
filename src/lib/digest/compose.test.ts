import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What goes in the weekly email.
 *
 * Two things are worth pinning above everything else. First, that a scheduled
 * insider sale is never reported as though it were a decision made this week
 * — an email saying "an officer sold $443k" without the word "pre-arranged"
 * is the most misleading sentence this app could send. Second, that no price
 * ever appears: an email is redistribution rather than display, and the free
 * price tiers do not allow it.
 */

const feed: {
  filings: unknown[];
  trades: unknown[];
  pendingSales: unknown[];
  stakes: unknown[];
} = { filings: [], trades: [], pendingSales: [], stakes: [] };

vi.mock("../providers", () => ({
  getProvider: () => ({ getFilings: () => Promise.resolve(feed.filings) }),
}));

vi.mock("../signals/insider", () => ({
  getInsiderActivity: () =>
    Promise.resolve({ trades: feed.trades, pendingSales: feed.pendingSales }),
}));

vi.mock("../signals/stakes", () => ({
  getStakeFilings: () => Promise.resolve(feed.stakes),
}));

/** Recent enough to fall inside the digest window. */
const RECENT = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
const OLD = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  process.env.AUTH_URL = "https://stockfilter.example";
  feed.filings = [];
  feed.trades = [];
  feed.pendingSales = [];
  feed.stakes = [];
});

afterEach(() => {
  delete process.env.AUTH_URL;
  vi.resetModules();
});

async function compose(symbols = ["AAPL"]) {
  const { composeDigest } = await import("./compose");
  return composeDigest(symbols);
}

function trade(over: Record<string, unknown> = {}) {
  return {
    form: "4",
    accessionNumber: "x",
    url: "https://www.sec.gov/form4",
    filedAt: RECENT,
    ownerName: "A Officer",
    isOfficer: true,
    isDirector: false,
    isTenPercentOwner: false,
    officerTitle: "SVP",
    scheduled: false,
    transactions: [
      {
        code: "S",
        label: "Sold on the open market",
        isOpenMarketTrade: true,
        direction: "disposed",
        shares: 1000,
        pricePerShare: 443,
        value: 443_000,
        sharesOwnedAfter: 1,
        securityTitle: "Common Stock",
      },
    ],
    ...over,
  };
}

describe("what the company filed", () => {
  it("reports a restatement notice", async () => {
    feed.filings = [
      { form: "8-K", filedAt: RECENT, items: "4.02", url: "https://sec.gov/a", periodOfReport: null, description: null },
    ];

    const digest = await compose();
    expect(digest.items).toHaveLength(1);
    expect(digest.items[0].text).toContain("cannot be relied on");
  });

  it("leaves routine items out", async () => {
    feed.filings = [
      { form: "8-K", filedAt: RECENT, items: "2.02,9.01", url: "https://sec.gov/a", periodOfReport: null, description: null },
    ];
    expect((await compose()).items).toEqual([]);
  });

  it("ignores anything outside the window", async () => {
    feed.filings = [
      { form: "8-K", filedAt: OLD, items: "4.02", url: "https://sec.gov/a", periodOfReport: null, description: null },
    ];
    expect((await compose()).items).toEqual([]);
  });

  it("reports an annual report", async () => {
    feed.filings = [
      { form: "10-K", filedAt: RECENT, items: null, url: "https://sec.gov/k", periodOfReport: null, description: null },
    ];
    expect((await compose()).items[0].text).toContain("annual report");
  });
});

describe("insider activity", () => {
  /*
    The line this whole module is arranged around. A pre-arranged sale was
    decided months before anything that happened this week, and reporting it
    without saying so turns a non-event into a warning.
  */
  it("says plainly when a sale was pre-arranged", async () => {
    feed.trades = [trade({ scheduled: true })];

    const digest = await compose();
    expect(digest.items[0].text).toContain("pre-arranged plan");
    expect(digest.items[0].text).toContain("months earlier");
  });

  it("says just as plainly when a sale was not", async () => {
    feed.trades = [trade({ scheduled: false })];

    const digest = await compose();
    expect(digest.items[0].text).toContain("not under a pre-arranged plan");
  });

  it("ranks an unscheduled sale above a scheduled one", async () => {
    const { composeDigest } = await import("./compose");
    feed.trades = [trade({ scheduled: true })];
    const scheduled = (await composeDigest(["AAPL"])).items[0].weight;
    feed.trades = [trade({ scheduled: false })];
    const unscheduled = (await composeDigest(["AAPL"])).items[0].weight;

    expect(unscheduled).toBeGreaterThan(scheduled);
  });

  it("reports an open-market purchase", async () => {
    feed.trades = [
      trade({
        transactions: [
          {
            code: "P",
            label: "Bought on the open market",
            isOpenMarketTrade: true,
            direction: "acquired",
            shares: 100,
            pricePerShare: 50,
            value: 5_000,
            sharesOwnedAfter: 100,
            securityTitle: "Common Stock",
          },
        ],
      }),
    ];

    const digest = await compose();
    expect(digest.items[0].text).toContain("bought");
  });

  it("ignores a grant, which is not a trade", async () => {
    feed.trades = [
      trade({
        transactions: [
          {
            code: "A",
            label: "Was granted shares",
            isOpenMarketTrade: false,
            direction: "acquired",
            shares: 100,
            pricePerShare: null,
            value: null,
            sharesOwnedAfter: 100,
            securityTitle: "Common Stock",
          },
        ],
      }),
    ];

    expect((await compose()).items).toEqual([]);
  });
});

describe("stakes", () => {
  it("distinguishes an activist stake from a passive one", async () => {
    feed.stakes = [
      { form: "SC 13D", intent: "activist", isAmendment: false, accessionNumber: "a", url: "https://sec.gov/d", filedAt: RECENT },
    ];
    expect((await compose()).items[0].text).toContain("intent to influence");

    feed.stakes = [
      { form: "SC 13G", intent: "passive", isAmendment: false, accessionNumber: "g", url: "https://sec.gov/g", filedAt: RECENT },
    ];
    expect((await compose()).items[0].text).toContain("passive stake");
  });

  it("skips an amendment to a stake already on file", async () => {
    feed.stakes = [
      { form: "SC 13G/A", intent: "passive", isAmendment: true, accessionNumber: "g", url: "https://sec.gov/g", filedAt: RECENT },
    ];
    expect((await compose()).items).toEqual([]);
  });
});

describe("the rendered email", () => {
  it("carries the disclaimer and a working unsubscribe link", async () => {
    const { renderDigest } = await import("./compose");
    feed.filings = [
      { form: "10-K", filedAt: RECENT, items: null, url: "https://sec.gov/k", periodOfReport: null, description: null },
    ];

    const body = renderDigest(await compose(), "https://stockfilter.example/api/digest/unsubscribe?token=x");

    expect(body).toContain("not investment advice");
    expect(body).toContain("Stop receiving these: https://stockfilter.example/api/digest/unsubscribe?token=x");
    expect(body).toContain("https://stockfilter.example/stock/AAPL");
  });

  /*
    An email is redistribution rather than display, and the free price tiers
    this app runs on do not permit it. Nothing in the digest pipeline fetches
    a quote, and this test is what keeps that true as the composer grows.
  */
  it("never quotes a price", async () => {
    const { renderDigest } = await import("./compose");
    feed.trades = [trade()];
    feed.filings = [
      { form: "10-Q", filedAt: RECENT, items: null, url: "https://sec.gov/q", periodOfReport: null, description: null },
    ];

    const body = renderDigest(await compose(), "https://example.com/u");

    for (const banned of ["share price", "a share", "closed at", "traded at", "%"]) {
      expect(body.toLowerCase()).not.toContain(banned);
    }
  });

  it("says a quiet week is ordinary rather than broken", async () => {
    const { renderDigest, digestSubject } = await import("./compose");
    const digest = await compose();

    expect(digest.items).toEqual([]);
    expect(renderDigest(digest, "https://example.com/u")).toContain("ordinary state of things");
    expect(digestSubject(digest)).toContain("quiet week");
  });

  it("leads the subject with the count of serious filings", async () => {
    const { digestSubject } = await import("./compose");
    feed.filings = [
      { form: "8-K", filedAt: RECENT, items: "4.02", url: "https://sec.gov/a", periodOfReport: null, description: null },
    ];

    expect(digestSubject(await compose())).toBe("One thing to look at in your saved companies");
  });
});
