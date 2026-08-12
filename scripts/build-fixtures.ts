/**
 * Downloads SEC companyfacts for the test companies and trims them to only the
 * concepts referenced by CONCEPT_MAP, so fixtures stay small enough to commit.
 *
 * The three companies are chosen to cover every branch in the normalizer:
 *   AAPL — us-gaap, classified balance sheet, tags Liabilities directly
 *   RY   — ifrs-full, bank with an unclassified balance sheet (no current assets)
 *   SHOP — us-gaap, does NOT tag Liabilities (must be derived)
 *
 * Usage: npx tsx scripts/build-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONCEPT_MAP } from "../src/lib/fundamentals/concept-map";
import { SEC_USER_AGENT } from "../src/lib/providers/sec-config";

const COMPANIES = [
  { ticker: "AAPL", cik: "0000320193" },
  { ticker: "RY", cik: "0001000275" },
  { ticker: "SHOP", cik: "0001594805" },
];

const OUT_DIR = join(process.cwd(), "src/lib/fundamentals/__fixtures__");

const WANTED = new Set(Object.values(CONCEPT_MAP).flat());

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const { ticker, cik } of COMPANIES) {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    process.stdout.write(`Fetching ${ticker}... `);

    const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
    if (!res.ok) throw new Error(`${ticker}: HTTP ${res.status}`);
    const raw = await res.json();

    const facts: Record<string, Record<string, unknown>> = {};
    for (const [taxonomy, concepts] of Object.entries(
      raw.facts as Record<string, Record<string, unknown>>,
    )) {
      for (const [concept, node] of Object.entries(concepts)) {
        if (!WANTED.has(concept)) continue;
        facts[taxonomy] ??= {};
        facts[taxonomy][concept] = node;
      }
    }

    const trimmed = { cik: raw.cik, entityName: raw.entityName, facts };
    const path = join(OUT_DIR, `${ticker.toLowerCase()}.json`);
    writeFileSync(path, JSON.stringify(trimmed));

    const kept = Object.values(facts).reduce((n, c) => n + Object.keys(c).length, 0);
    console.log(`${kept} concepts kept -> ${path}`);

    // Stay well inside the SEC's 10 req/s fair-use limit.
    await new Promise((r) => setTimeout(r, 300));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
