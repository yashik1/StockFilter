/**
 * Nightly ingest: refreshes fundamentals and recomputes scores for the universe.
 *
 * Runs anywhere with a DATABASE_URL — locally, in GitHub Actions, or on a
 * Railway cron. Prefer this over the Vercel cron route for full runs: Vercel's
 * function timeout is too short to process the whole universe in one request,
 * and Hobby crons only fire once a day.
 *
 *   npx tsx scripts/ingest.ts                  # whole universe
 *   npx tsx scripts/ingest.ts AAPL MSFT RY     # specific symbols
 *   npx tsx scripts/ingest.ts --limit 25       # first 25, for a smoke test
 */
import "dotenv/config";
import { closeDb } from "../src/lib/db";
import { ingestSymbols } from "../src/lib/ingest";
import { getUniverse } from "../src/lib/universe";

function parseArgs(argv: string[]) {
  const symbols: string[] = [];
  let limit: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      limit = Number(argv[++i]);
    } else if (!argv[i].startsWith("--")) {
      symbols.push(argv[i].toUpperCase());
    }
  }
  return { symbols, limit };
}

async function main() {
  const { symbols, limit } = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set.\n" +
        "Provision Postgres on Railway, then put its connection string in .env.local",
    );
    process.exit(1);
  }

  let targets = symbols.length ? symbols : getUniverse();
  if (limit) targets = targets.slice(0, limit);

  console.log(`Ingesting ${targets.length} symbols...\n`);

  const startedAt = Date.now();
  const result = await ingestSymbols(targets, (done, total, symbol) => {
    const pct = Math.round((done / total) * 100);
    process.stdout.write(`\r  [${String(pct).padStart(3)}%] ${done}/${total}  ${symbol.padEnd(8)}`);
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n\nDone in ${seconds}s — ${result.processed} succeeded, ${result.failed} failed.`);

  if (result.errors.length) {
    console.log("\nFailures:");
    for (const e of result.errors.slice(0, 30)) {
      console.log(`  ${e.symbol.padEnd(8)} ${e.error}`);
    }
    if (result.errors.length > 30) {
      console.log(`  ...and ${result.errors.length - 30} more`);
    }
  }

  await closeDb();
  // A run where everything failed is a real failure and should break CI.
  process.exit(result.processed === 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nIngest failed:", err);
  await closeDb();
  process.exit(1);
});
