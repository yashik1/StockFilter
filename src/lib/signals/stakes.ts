import { cikForSymbol, fetchSubmissions } from "../providers/sec-edgar";

/**
 * Somebody crossed 5% ownership.
 *
 * Schedule 13D and 13G are filed by anyone who acquires more than 5% of a
 * company's shares, and the two forms say opposite things about intent. A 13D
 * discloses a stake taken with the purpose of influencing the company —
 * pushing for a board seat, a sale, a strategy change — and has to be updated
 * within days of any material change. A 13G is the same threshold crossed
 * passively — an index fund's position growing, an institution simply
 * accumulating — filed on a slower annual schedule. Reporting both the same
 * way as "someone bought a big stake" would erase the distinction that
 * actually matters.
 *
 * Only metadata is read here, not the documents themselves. Unlike Form 4,
 * these are free-text filings — a 13D is often dozens of pages of legal
 * argument — and there is no structured field for "how many shares" or
 * "what stake" to extract without reading prose. The filing date, the amender
 * status and a link to the source are what can be said honestly without
 * summarising text this module has not read.
 */

/** How long a stake filing still counts as recent. */
const WINDOW_DAYS = 180;

/** Filed metadata only says a form was submitted, not what changed inside
 *  it — an amendment ("/A") could disclose a new 8% stake or a routine
 *  update reaffirming an unchanged 6%. Neither this module nor the metadata
 *  it reads can tell those apart. */
const MAX_FILINGS = 6;

export type StakeIntent = "activist" | "passive";

export interface StakeFiling {
  form: string;
  intent: StakeIntent;
  /** True for a "/A" filing — an amendment to a stake already on file,
   *  rather than a first disclosure of a new one. */
  isAmendment: boolean;
  accessionNumber: string;
  url: string;
  filedAt: string;
}

export function intentFor(form: string): StakeIntent {
  return form.startsWith("SC 13D") ? "activist" : "passive";
}

/**
 * Recent 5%-ownership disclosures naming this company as the issuer.
 *
 * Reads the same submissions payload the rest of the signals modules do —
 * see getInsiderActivity in ./insider.ts for why that is one fetch, not one
 * per caller.
 */
export async function getStakeFilings(symbol: string): Promise<StakeFiling[]> {
  const cik = await cikForSymbol(symbol);
  if (!cik) return [];

  const sub = await fetchSubmissions(cik);
  if (!sub?.filings?.recent) return [];

  const r = sub.filings.recent;
  const cikNum = String(Number(cik));
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;

  const filings: StakeFiling[] = [];

  for (let i = 0; i < r.form.length && filings.length < MAX_FILINGS; i++) {
    const form = r.form[i];
    if (!form.startsWith("SC 13D") && !form.startsWith("SC 13G")) continue;

    const filedAt = r.filingDate[i];
    if (Date.parse(filedAt) < cutoff) continue;

    const accn = r.accessionNumber[i];
    const bare = accn.replace(/-/g, "");
    const doc = r.primaryDocument[i];

    filings.push({
      form,
      intent: intentFor(form),
      isAmendment: form.endsWith("/A"),
      accessionNumber: accn,
      url: doc
        ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${doc}`
        : `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${accn}-index.htm`,
      filedAt,
    });
  }

  return filings.sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
}
