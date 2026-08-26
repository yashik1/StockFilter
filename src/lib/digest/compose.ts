import { getProvider } from "../providers";
import { describeEightK } from "../signals/eight-k-items";
import { getInsiderActivity } from "../signals/insider";
import { getStakeFilings } from "../signals/stakes";
import { money } from "../format";
import { siteUrl } from "../site-url";

/**
 * The weekly digest: what the companies you saved actually filed.
 *
 * Everything here comes from SEC EDGAR, which is public domain — filings,
 * decoded 8-K item codes, insider transactions, 5%-stake disclosures.
 *
 * **No prices, and no quotes.** An email is redistribution rather than
 * display, and the free price tiers this app runs on do not permit it. That
 * is the same line that keeps the share cards price-free, and it is why the
 * digest reads as "here is what was filed" rather than "here is how your
 * holdings did" — which is a better email anyway, since a week of price
 * movement is noise and a restatement is not.
 */

export interface DigestItem {
  symbol: string;
  /** What happened, in one plain sentence. */
  text: string;
  /** Filed date, so a reader can see how fresh it is. */
  filedAt: string;
  url: string;
  /** Ordering weight: the strongest filings a company can publish come first. */
  weight: number;
}

export interface Digest {
  items: DigestItem[];
  /** Symbols that were checked, whether or not they produced anything. */
  covered: string[];
}

/** How far back one digest looks. A day of slack, so a late run misses nothing. */
const WINDOW_DAYS = 8;

/**
 * A ceiling on how many saved companies one digest covers.
 *
 * EDGAR's fair-use limit is 10 requests a second and each company here costs
 * a handful. Somebody with two hundred saved companies gets the first forty
 * rather than a rate-limit ban for everybody.
 */
const MAX_SYMBOLS = 40;

const WEIGHT = { redFlag: 100, stake: 60, insiderBuy: 50, insiderSell: 40, notable: 30 };

function withinWindow(filedAt: string): boolean {
  const filed = Date.parse(filedAt);
  return Number.isFinite(filed) && Date.now() - filed <= WINDOW_DAYS * 86_400_000;
}

/**
 * Everything worth telling one reader about one company this week.
 *
 * Each source is caught independently. A company whose insider feed fails
 * should still contribute its filings rather than dropping out of the email
 * entirely, and one unreachable company must never cost somebody the whole
 * digest.
 */
async function forSymbol(symbol: string): Promise<DigestItem[]> {
  const items: DigestItem[] = [];

  const [filings, insider, stakes] = await Promise.all([
    getProvider().getFilings(symbol, 25).catch(() => []),
    getInsiderActivity(symbol).catch(() => ({ trades: [], pendingSales: [] })),
    getStakeFilings(symbol).catch(() => []),
  ]);

  // ---- what the company said about itself --------------------------------
  for (const filing of filings) {
    if (!withinWindow(filing.filedAt)) continue;

    if (filing.form === "8-K" && filing.items) {
      const summary = describeEightK(filing.items);
      for (const item of summary.items) {
        if (item.severity === "routine") continue;
        items.push({
          symbol,
          text: item.label,
          filedAt: filing.filedAt,
          url: filing.url,
          weight: item.severity === "red-flag" ? WEIGHT.redFlag : WEIGHT.notable,
        });
      }
    } else if (filing.form === "10-K" || filing.form === "10-Q" || filing.form === "40-F") {
      items.push({
        symbol,
        text:
          filing.form === "10-Q"
            ? "Published quarterly results"
            : "Published its annual report",
        filedAt: filing.filedAt,
        url: filing.url,
        weight: WEIGHT.notable,
      });
    }
  }

  // ---- what the people running it did ------------------------------------
  for (const trade of insider.trades) {
    if (!withinWindow(trade.filedAt)) continue;

    const open = trade.transactions.filter((t) => t.isOpenMarketTrade);
    if (open.length === 0) continue;

    const bought = open.filter((t) => t.direction === "acquired");
    const sold = open.filter((t) => t.direction === "disposed");
    const total = (rows: typeof open) => rows.reduce((sum, t) => sum + (t.value ?? 0), 0);
    const who = trade.officerTitle ? `${trade.ownerName} (${trade.officerTitle})` : trade.ownerName;

    if (bought.length > 0) {
      // A purchase with the insider's own money is the classic signal, and
      // there is no scheduled-plan caveat to make about one.
      items.push({
        symbol,
        text: `${who} bought ${money(total(bought))} of shares on the open market`,
        filedAt: trade.filedAt,
        url: trade.url,
        weight: WEIGHT.insiderBuy,
      });
    }

    if (sold.length > 0) {
      /*
        The caveat travels with the sentence, never as a footnote.

        A sale under a Rule 10b5-1 plan was arranged months in advance and
        says close to nothing about today. An email that reports "an officer
        sold $443k" without that word is actively misleading, and it is the
        single most common way an insider feed does harm.
      */
      items.push({
        symbol,
        text: trade.scheduled
          ? `${who} sold ${money(total(sold))} of shares under a pre-arranged plan set months earlier`
          : `${who} sold ${money(total(sold))} of shares on the open market, not under a pre-arranged plan`,
        filedAt: trade.filedAt,
        url: trade.url,
        weight: trade.scheduled ? WEIGHT.notable : WEIGHT.insiderSell,
      });
    }
  }

  for (const pending of insider.pendingSales) {
    if (!withinWindow(pending.filedAt)) continue;
    items.push({
      symbol,
      text:
        `${pending.personName ?? "An insider"} filed notice to sell ` +
        `${money(pending.aggregateMarketValue)} of shares` +
        (pending.approxSaleDate ? ` on or after ${pending.approxSaleDate}` : ""),
      filedAt: pending.filedAt,
      url: pending.url,
      weight: WEIGHT.insiderSell,
    });
  }

  // ---- who took a large position -----------------------------------------
  for (const stake of stakes) {
    if (!withinWindow(stake.filedAt) || stake.isAmendment) continue;
    items.push({
      symbol,
      text:
        stake.intent === "activist"
          ? "Someone disclosed a stake above 5% and signalled intent to influence the company"
          : "Someone disclosed a passive stake above 5%",
      filedAt: stake.filedAt,
      url: stake.url,
      weight: WEIGHT.stake,
    });
  }

  return items;
}

/** Builds one reader's digest across everything they have saved. */
export async function composeDigest(symbols: string[]): Promise<Digest> {
  const covered = symbols.slice(0, MAX_SYMBOLS);

  // Sequential rather than parallel, deliberately. EDGAR publishes a fair-use
  // limit of 10 requests a second and each company costs several; fanning out
  // across forty at once is how a deployment gets its user agent blocked.
  const items: DigestItem[] = [];
  for (const symbol of covered) {
    items.push(...(await forSymbol(symbol).catch(() => [])));
  }

  items.sort((a, b) => b.weight - a.weight || b.filedAt.localeCompare(a.filedAt));
  return { items, covered };
}

/**
 * The email body.
 *
 * Plain text, matching the only other message this app sends. A digest is a
 * list of short sentences with links, which HTML would make heavier without
 * making clearer — and plain text cannot render differently in one client
 * than another.
 */
export function renderDigest(digest: Digest, unsubscribeUrl: string): string {
  const base = siteUrl();
  const lines: string[] = [];

  lines.push("Here is what the companies you saved filed this week.");
  lines.push("");

  if (digest.items.length === 0) {
    lines.push(
      "Nothing was filed at any of them — which is the ordinary state of things, " +
        "not a gap in the data.",
    );
  } else {
    let current = "";
    for (const item of digest.items) {
      if (item.symbol !== current) {
        current = item.symbol;
        lines.push("");
        lines.push(`${item.symbol}  ${base}/stock/${encodeURIComponent(item.symbol)}`);
      }
      lines.push(`  - ${item.text} (filed ${item.filedAt})`);
      lines.push(`    ${item.url}`);
    }
  }

  lines.push("");
  lines.push(`Companies checked: ${digest.covered.join(", ") || "none"}`);
  lines.push("");
  lines.push("---");
  lines.push(
    "Everything above is taken from filings with the SEC. This is educational " +
      "information only, not investment advice, and nothing here is a recommendation " +
      "to buy or sell anything.",
  );
  lines.push("");
  lines.push(`Stop receiving these: ${unsubscribeUrl}`);

  return lines.join("\n");
}

/** The subject line, which should say whether the week was eventful. */
export function digestSubject(digest: Digest): string {
  const severe = digest.items.filter((i) => i.weight >= WEIGHT.redFlag).length;
  if (severe > 0) {
    return severe === 1
      ? "One thing to look at in your saved companies"
      : `${severe} things to look at in your saved companies`;
  }
  if (digest.items.length === 0) return "A quiet week for your saved companies";
  return `This week at your saved companies (${digest.items.length} filings)`;
}
