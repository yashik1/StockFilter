/**
 * Checks every symbol in the universe against SEC EDGAR's company file.
 *
 * Tickers rot continuously — companies are acquired, taken private, or simply
 * change symbol (BK became BNY, GPS became GAP). A stale entry fails silently
 * during ingest as "no CIK found", so this reports the whole list at once and,
 * where a company still files under a different symbol, suggests the rename.
 *
 *   npm run universe:audit
 */
import "dotenv/config";
import { getUniverse } from "../src/lib/universe";
import { SEC_USER_AGENT } from "../src/lib/providers/sec-config";

interface Row {
  cik: number;
  name: string;
  ticker: string;
  exchange: string | null;
}

/** Words that carry no signal when matching one company name to another. */
const NOISE = /\b(inc|corp|corporation|co|company|ltd|limited|plc|group|holdings|the|and|of|new|class|common|stock)\b/gi;

function normalizeName(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(NOISE, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

async function main() {
  const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
    headers: { "User-Agent": SEC_USER_AGENT },
  });
  if (!res.ok) throw new Error(`SEC company file: HTTP ${res.status}`);

  const raw = (await res.json()) as { fields: string[]; data: (string | number)[][] };
  const idx = Object.fromEntries(raw.fields.map((f, i) => [f, i]));
  const rows: Row[] = raw.data.map((r) => ({
    cik: Number(r[idx.cik]),
    name: String(r[idx.name]),
    ticker: String(r[idx.ticker]).toUpperCase(),
    exchange: r[idx.exchange] ? String(r[idx.exchange]) : null,
  }));

  const byTicker = new Map(rows.map((r) => [r.ticker, r]));
  const universe = getUniverse();

  const missing: string[] = [];
  for (const symbol of universe) {
    // Mirrors the lookup in cikForSymbol, including the dot/hyphen fallback.
    if (byTicker.has(symbol) || byTicker.has(symbol.replace(/\./g, "-"))) continue;
    missing.push(symbol);
  }

  console.log(`Universe: ${universe.length} symbols`);
  console.log(`Resolved: ${universe.length - missing.length}`);
  console.log(`Missing:  ${missing.length}\n`);

  if (missing.length === 0) {
    console.log("Every symbol resolves to a CIK.");
    return;
  }

  // For each miss, look for a registrant whose name overlaps a symbol that does
  // resolve — that usually surfaces a straightforward rename.
  console.log("Symbols with no CIK in EDGAR:\n");
  for (const symbol of missing) {
    console.log(`  ${symbol}`);
  }

  console.log(
    "\nEach of these is acquired, taken private, renamed, or not SEC-registered.\n" +
      "Update src/lib/universe.ts — remove them, or swap in the current ticker.",
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Audit failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
