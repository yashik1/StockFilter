import { SEC_USER_AGENT } from "../providers/sec-config";
import { cikForSymbol, fetchSubmissions } from "../providers/sec-edgar";
import { fieldBool, fieldNumber, fieldValue, tagBlocks, tagText } from "./xml-extract";

/**
 * Insider activity — who at a company bought or sold, and who has filed
 * notice that they intend to.
 *
 * Form 4 is filed within two business days of a trade by anyone required to
 * report: officers, directors, and 10%+ owners. Form 144 is filed *before* a
 * sale — a notice of intent, which is as close to "before the news" as a
 * public filing gets. Both are already inside the submissions feed the app
 * fetches for every symbol; this module is the part that was never read.
 *
 * The distinction this exists to make, more than any other: an open-market
 * purchase is somebody spending their own money because they chose to.
 * A sale under a pre-arranged Rule 10b5-1 plan was decided months earlier on a
 * schedule, for reasons that usually have nothing to do with the company's
 * prospects — diversification, a tax bill, a divorce settlement. Reporting
 * both as "the CFO sold $2M in stock" without that distinction is the kind of
 * headline that teaches a beginner the wrong lesson.
 */

const HEADERS = { "User-Agent": SEC_USER_AGENT };

/** How long an insider transaction still counts as recent activity. */
const WINDOW_DAYS = 120;

/**
 * A filed Form 4/144 document never changes once accepted, so caching it is
 * simply correct, not a tradeoff — and it is what keeps a hot stock page from
 * spending its EDGAR budget on documents it already has.
 */
const FILING_TTL = 60 * 60 * 24 * 30;

/**
 * Upper bound on how many filings this fetches per symbol per kind, so a
 * company with an unusually large number of reporting insiders cannot turn
 * one page view into an EDGAR request storm.
 */
const MAX_TRADE_FILINGS = 8;
const MAX_PENDING_FILINGS = 6;

const TRANSACTION_CODES: Record<string, { label: string; isOpenMarketTrade: boolean }> = {
  P: { label: "Bought on the open market", isOpenMarketTrade: true },
  S: { label: "Sold on the open market", isOpenMarketTrade: true },
  A: { label: "Was granted or awarded shares", isOpenMarketTrade: false },
  D: { label: "Shares were sold back to the company", isOpenMarketTrade: false },
  F: { label: "Had shares withheld to cover taxes", isOpenMarketTrade: false },
  M: { label: "Exercised stock options", isOpenMarketTrade: false },
  C: { label: "Converted a derivative security", isOpenMarketTrade: false },
  X: { label: "Exercised an in-the-money option", isOpenMarketTrade: false },
  G: { label: "Gifted shares", isOpenMarketTrade: false },
  V: { label: "Voluntarily reported a transaction early", isOpenMarketTrade: false },
  U: { label: "Disposed of shares in a company transaction", isOpenMarketTrade: false },
  J: { label: "Reported another kind of transaction", isOpenMarketTrade: false },
};

export interface InsiderTransaction {
  code: string;
  label: string;
  /**
   * True only for P and S — an actual buy or sell at a market price, as
   * opposed to a grant, an option exercise, or shares withheld for tax.
   */
  isOpenMarketTrade: boolean;
  direction: "acquired" | "disposed" | null;
  shares: number | null;
  pricePerShare: number | null;
  /** shares * pricePerShare, when both are known. */
  value: number | null;
  sharesOwnedAfter: number | null;
  securityTitle: string | null;
}

export interface InsiderFiling {
  form: "3" | "4";
  accessionNumber: string;
  /** The human-readable filing, for a "view on EDGAR" link. */
  url: string;
  filedAt: string;
  ownerName: string;
  isOfficer: boolean;
  isDirector: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
  /**
   * True when every transaction in this filing ran under a pre-arranged
   * Rule 10b5-1(c) plan — decided on a schedule set in advance, not a
   * reaction to anything happening at the company now.
   */
  scheduled: boolean;
  transactions: InsiderTransaction[];
}

export interface PendingSale {
  accessionNumber: string;
  url: string;
  /** When the notice itself was filed. */
  filedAt: string;
  personName: string | null;
  relationship: string | null;
  /** The date on or after which the sale may occur — filed before it happens. */
  approxSaleDate: string | null;
  units: number | null;
  aggregateMarketValue: number | null;
  /**
   * How the shares were obtained — "Restricted Stock Units", "Open Market",
   * and so on, straight from the filing.
   */
  acquiredVia: string | null;
}

/**
 * Strips EDGAR's XSLT-viewer folder (`xslF345X06/`, `xsl144X01/`, …) from a
 * primary document path, leaving the raw file the viewer renders — the
 * viewer path itself returns pre-rendered HTML, not the XML this parses.
 */
function rawDocumentPath(primaryDocument: string): string {
  return primaryDocument.replace(/^xsl[^/]+\//, "");
}

function filingUrl(cikNum: string, accessionNumber: string, primaryDocument: string): string {
  const bare = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${primaryDocument}`;
}

async function fetchRawXml(
  cikNum: string,
  accessionNumber: string,
  primaryDocument: string,
): Promise<string | null> {
  const bare = accessionNumber.replace(/-/g, "");
  const raw = rawDocumentPath(primaryDocument);
  const res = await fetch(
    `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${raw}`,
    { headers: HEADERS, next: { revalidate: FILING_TTL } },
  );
  if (!res.ok) return null;
  return res.text();
}

/**
 * One `<reportingOwner>` block's identity and relationship to the issuer.
 * A filing can name more than one owner (joint filers); this reads the first,
 * which is the person the SEC's own site treats as primary.
 */
function parseOwner(xml: string): {
  name: string;
  isOfficer: boolean;
  isDirector: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
} {
  const block = tagBlocks(xml, "reportingOwner")[0] ?? "";
  return {
    // Unlike most facts in this schema, rptOwnerName is a plain tag rather
    // than the <field><value>…</value></field> wrapper — fieldValue would
    // have found nothing and every filing would have shown "Unknown filer".
    name: tagText(block, "rptOwnerName") ?? "Unknown filer",
    isOfficer: fieldBool(block, "isOfficer"),
    isDirector: fieldBool(block, "isDirector"),
    isTenPercentOwner: fieldBool(block, "isTenPercentOwner"),
    officerTitle: tagText(block, "officerTitle"),
  };
}

function parseTransaction(block: string): InsiderTransaction {
  const code = tagText(block, "transactionCode") ?? "";
  const known = TRANSACTION_CODES[code];
  const shares = fieldNumber(block, "transactionShares");
  const pricePerShare = fieldNumber(block, "transactionPricePerShare");
  const acquiredDisposed = fieldValue(block, "transactionAcquiredDisposedCode");

  return {
    code,
    label: known?.label ?? "Reported a transaction",
    isOpenMarketTrade: known?.isOpenMarketTrade ?? false,
    direction: acquiredDisposed === "A" ? "acquired" : acquiredDisposed === "D" ? "disposed" : null,
    shares,
    pricePerShare,
    value: shares != null && pricePerShare != null ? shares * pricePerShare : null,
    sharesOwnedAfter: fieldNumber(block, "sharesOwnedFollowingTransaction"),
    securityTitle: fieldValue(block, "securityTitle"),
  };
}

/**
 * Parses one Form 3 or 4's raw XML.
 *
 * Only `nonDerivativeTable` transactions are read — actual common stock
 * changing hands. Derivative transactions (option grants, RSU conversions)
 * live in a separate `derivativeTable` with their own valuation mechanics,
 * and folding them into the same share-and-price arithmetic here would
 * silently produce a number that means something different.
 */
export function parseForm4Xml(
  xml: string,
  meta: { form: "3" | "4"; accessionNumber: string; url: string; filedAt: string },
): InsiderFiling {
  const owner = parseOwner(xml);
  const scheduled = fieldBool(xml, "aff10b5One") || tagText(xml, "aff10b5One") === "true";

  const table = tagBlocks(xml, "nonDerivativeTable")[0] ?? "";
  const transactions = tagBlocks(table, "nonDerivativeTransaction").map(parseTransaction);

  return {
    form: meta.form,
    accessionNumber: meta.accessionNumber,
    url: meta.url,
    filedAt: meta.filedAt,
    ownerName: owner.name,
    isOfficer: owner.isOfficer,
    isDirector: owner.isDirector,
    isTenPercentOwner: owner.isTenPercentOwner,
    officerTitle: owner.officerTitle,
    scheduled,
    transactions,
  };
}

/** `MM/DD/YYYY`, as Form 144 writes its dates, to `YYYY-MM-DD`. */
function usDateToIso(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Parses one Form 144's raw XML — a notice of intent to sell, filed before
 * the sale takes place.
 */
export function parseForm144Xml(
  xml: string,
  meta: { accessionNumber: string; url: string; filedAt: string },
): PendingSale {
  const marketValueRaw = tagText(xml, "aggregateMarketValue");
  const unitsRaw = tagText(xml, "noOfUnitsSold");
  const marketValue = marketValueRaw != null ? Number(marketValueRaw) : NaN;
  const units = unitsRaw != null ? Number(unitsRaw) : NaN;

  return {
    accessionNumber: meta.accessionNumber,
    url: meta.url,
    filedAt: meta.filedAt,
    personName: tagText(xml, "nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold"),
    relationship: tagText(xml, "relationshipToIssuer"),
    approxSaleDate: usDateToIso(tagText(xml, "approxSaleDate")),
    units: Number.isFinite(units) ? units : null,
    aggregateMarketValue: Number.isFinite(marketValue) ? marketValue : null,
    acquiredVia: tagText(xml, "natureOfAcquisitionTransaction"),
  };
}

export interface InsiderActivity {
  trades: InsiderFiling[];
  pendingSales: PendingSale[];
}

const EMPTY: InsiderActivity = { trades: [], pendingSales: [] };

/**
 * Recent insider trades and pending-sale notices for a symbol.
 *
 * Reads the same submissions payload `getFilings` already fetches and caches
 * (../providers/sec-edgar.ts) — no extra call to learn what filings exist,
 * only to read the ones that matter here.
 */
export async function getInsiderActivity(symbol: string): Promise<InsiderActivity> {
  const cik = await cikForSymbol(symbol);
  if (!cik) return EMPTY;

  const sub = await fetchSubmissions(cik);
  if (!sub?.filings?.recent) return EMPTY;

  const r = sub.filings.recent;
  const cikNum = String(Number(cik));
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;

  const tradeRows: { accn: string; doc: string; filedAt: string; form: "3" | "4" }[] = [];
  const pendingRows: { accn: string; doc: string; filedAt: string }[] = [];

  for (let i = 0; i < r.form.length; i++) {
    const filedAt = r.filingDate[i];
    if (Date.parse(filedAt) < cutoff) continue;

    if ((r.form[i] === "4" || r.form[i] === "3") && tradeRows.length < MAX_TRADE_FILINGS) {
      tradeRows.push({
        accn: r.accessionNumber[i],
        doc: r.primaryDocument[i],
        filedAt,
        form: r.form[i] as "3" | "4",
      });
    } else if (r.form[i] === "144" && pendingRows.length < MAX_PENDING_FILINGS) {
      pendingRows.push({ accn: r.accessionNumber[i], doc: r.primaryDocument[i], filedAt });
    }
  }

  const [trades, pendingSales] = await Promise.all([
    Promise.all(
      tradeRows.map(async (row) => {
        const xml = await fetchRawXml(cikNum, row.accn, row.doc).catch(() => null);
        if (!xml) return null;
        return parseForm4Xml(xml, {
          form: row.form,
          accessionNumber: row.accn,
          url: filingUrl(cikNum, row.accn, row.doc),
          filedAt: row.filedAt,
        });
      }),
    ),
    Promise.all(
      pendingRows.map(async (row) => {
        const xml = await fetchRawXml(cikNum, row.accn, row.doc).catch(() => null);
        if (!xml) return null;
        return parseForm144Xml(xml, {
          accessionNumber: row.accn,
          url: filingUrl(cikNum, row.accn, row.doc),
          filedAt: row.filedAt,
        });
      }),
    ),
  ]);

  return {
    trades: trades
      .filter((t): t is InsiderFiling => t !== null && t.transactions.length > 0)
      .sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1)),
    pendingSales: pendingSales
      .filter((p): p is PendingSale => p !== null)
      .sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1)),
  };
}
