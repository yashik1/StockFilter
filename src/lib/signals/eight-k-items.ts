/**
 * What an 8-K was actually about.
 *
 * Every 8-K used to be announced the same way — "The company reported a major
 * event" — which is the identical sentence for a routine quarterly earnings
 * release and for an admission that previously published accounts cannot be
 * relied on. Those are not the same news, and the difference is already in the
 * data: EDGAR tags each filing with the item numbers it reports under, and the
 * app was fetching that field and ignoring it.
 *
 * The item numbers come from the SEC's own Form 8-K, which groups them by
 * section: 1 for business and operations, 2 for financial information, 3 for
 * securities, 4 for accountants, 5 for governance, 7 for Regulation FD, 8 for
 * anything else.
 */

/**
 * How much a reader should care.
 *
 * Deliberately about the *filing*, not about the share price. Nothing here
 * predicts a direction — a "red flag" is an item that would materially change
 * how somebody reads this company's accounts, which is the question this app
 * is built around. An acquisition can be excellent news and is still `notable`
 * rather than routine, because it changes what the next set of figures means.
 */
export type ItemSeverity = "routine" | "notable" | "red-flag";

export interface EightKItem {
  code: string;
  /** Plain English, written as a statement of what happened. */
  label: string;
  severity: ItemSeverity;
}

/**
 * The item codes an operating company actually files under.
 *
 * The asset-backed section (6.x) is omitted: those forms are filed by
 * securitisation trusts, not by the companies this app screens, and a label
 * invented for one would be a guess.
 */
const ITEMS: Record<string, { label: string; severity: ItemSeverity }> = {
  // --- 1: business and operations ---
  "1.01": { label: "Signed a material agreement", severity: "notable" },
  "1.02": { label: "Terminated a material agreement", severity: "notable" },
  "1.03": { label: "Entered bankruptcy or receivership", severity: "red-flag" },
  "1.04": { label: "Reported a mine safety matter", severity: "routine" },
  "1.05": { label: "Disclosed a material cybersecurity incident", severity: "notable" },

  // --- 2: financial information ---
  "2.01": { label: "Completed an acquisition or disposal", severity: "notable" },
  "2.02": { label: "Published results", severity: "routine" },
  "2.03": { label: "Took on a direct financial obligation", severity: "notable" },
  // The obligation itself was already disclosed; this says something has gone
  // wrong enough to accelerate it, which is a different and worse fact.
  "2.04": { label: "Triggered early repayment on an obligation", severity: "red-flag" },
  "2.05": { label: "Announced restructuring or exit costs", severity: "notable" },
  "2.06": { label: "Recorded a material impairment", severity: "red-flag" },

  // --- 3: securities and trading markets ---
  "3.01": { label: "Received a delisting or listing-standard notice", severity: "red-flag" },
  "3.02": { label: "Sold shares outside a public offering", severity: "notable" },
  "3.03": { label: "Changed the rights attached to its shares", severity: "notable" },

  // --- 4: accountants and financial statements ---
  /*
    The two items this app cares about most.

    It scores accounting quality with Beneish, and these are the moments a
    company says out loud what that model can only infer. 4.02 in particular
    is the strongest accounting warning in the entire filing system: the
    company is stating that figures it already published should not be relied
    on. Labelling that "a major event" alongside an earnings release was the
    single worst case of the old wording.
  */
  "4.01": { label: "Changed its auditor", severity: "red-flag" },
  "4.02": { label: "Said previously published accounts cannot be relied on", severity: "red-flag" },

  // --- 5: governance and management ---
  "5.01": { label: "Changed control of the company", severity: "notable" },
  "5.02": { label: "Had a director or senior officer leave or join", severity: "notable" },
  "5.03": { label: "Amended its charter or changed its financial year", severity: "routine" },
  "5.04": { label: "Suspended trading in its employee benefit plans", severity: "routine" },
  "5.05": { label: "Amended or waived part of its code of ethics", severity: "notable" },
  "5.06": { label: "Ceased to be a shell company", severity: "notable" },
  "5.07": { label: "Held a shareholder vote", severity: "routine" },
  "5.08": { label: "Received shareholder director nominations", severity: "routine" },

  // --- 7 and 8 ---
  "7.01": { label: "Made a Regulation FD disclosure", severity: "routine" },
  "8.01": { label: "Reported another event", severity: "routine" },

  /*
    9.01 is bookkeeping, not news — it means "documents are attached", and it
    rides along on most 8-Ks. It is mapped so it can be recognised and skipped
    rather than left to fall through as unknown.
  */
  "9.01": { label: "Attached financial statements or exhibits", severity: "routine" },
};

/** Item codes that describe paperwork rather than an event. */
const BOILERPLATE = new Set(["9.01"]);

const SEVERITY_RANK: Record<ItemSeverity, number> = {
  "red-flag": 3,
  notable: 2,
  routine: 1,
};

/** One item code, or null when the SEC adds one this map has not caught up with. */
export function describeItem(code: string): EightKItem | null {
  const trimmed = code.trim();
  const entry = ITEMS[trimmed];
  return entry ? { code: trimmed, ...entry } : null;
}

export interface EightKSummary {
  /** A sentence for the headline, chosen from the most significant item. */
  headline: string;
  severity: ItemSeverity;
  /** Every recognised item, most significant first. */
  items: EightKItem[];
}

/**
 * Turns EDGAR's comma-separated item list into something worth reading.
 *
 * The headline is taken from the most significant item rather than the first,
 * because ordering in the filing is numerical, not editorial: an 8-K reporting
 * both an earnings release and an executive departure lists 2.02 before 5.02,
 * and the departure is the news.
 *
 * Returns a usable summary even when nothing is recognised, so an unmapped or
 * absent item list degrades to the old generic sentence rather than to a blank.
 */
export function describeEightK(rawItems: string | null | undefined): EightKSummary {
  const generic: EightKSummary = {
    headline: "The company reported a major event",
    severity: "notable",
    items: [],
  };

  if (!rawItems) return generic;

  const items = rawItems
    .split(",")
    .map((c) => describeItem(c))
    .filter((i): i is EightKItem => i !== null);

  if (items.length === 0) return generic;

  items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  // Prefer any real event over the exhibits note, but keep the note in the
  // list — falling back to it only when it is genuinely all there is.
  const lead = items.find((i) => !BOILERPLATE.has(i.code)) ?? items[0];

  return { headline: lead.label, severity: lead.severity, items };
}
