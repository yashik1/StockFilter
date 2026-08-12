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
// Loads .env.local when running locally. On a hosting platform the environment
// is already populated and this is a harmless no-op.
//
// dotenv and tsx are deliberately production dependencies, not dev ones: hosts
// set NODE_ENV=production, which prunes devDependencies, and this script would
// otherwise fail to start in a deployed container.
import "dotenv/config";
import { closeDb } from "../src/lib/db";
import { ingestSymbols } from "../src/lib/ingest";
import { getUniverse } from "../src/lib/universe";

/** Describes a connection string without ever printing the password. */
function describeDbUrl(url: string): string {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${hostname}:${port || 5432}${pathname}`;
  } catch {
    return "set (unparseable)";
  }
}

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

  // Print what the process can actually see before doing any work. Silent
  // misconfiguration is the most common failure here, especially on a hosting
  // platform where the environment comes from the dashboard rather than a file.
  const dbUrl = process.env.DATABASE_URL;
  console.log("Environment:");
  console.log(`  DATABASE_URL       ${dbUrl ? describeDbUrl(dbUrl) : "MISSING"}`);
  console.log(`  SEC_USER_AGENT     ${process.env.SEC_USER_AGENT ? "set" : "using default"}`);
  console.log(`  FINNHUB_API_KEY    ${process.env.FINNHUB_API_KEY ? "set" : "not set (market caps will be limited)"}`);
  console.log(`  TWELVEDATA_API_KEY ${process.env.TWELVEDATA_API_KEY ? "set" : "not set (market caps will be limited)"}`);
  console.log();

  if (!dbUrl) {
    console.error(
      "DATABASE_URL is not set, so there is nowhere to store the results.\n\n" +
        "  Running on Railway: open the service's Variables tab and add\n" +
        "    DATABASE_URL = ${{Postgres.DATABASE_URL}}\n" +
        "  Running locally:   put the database's PUBLIC connection string in .env.local\n",
    );
    process.exit(1);
  }

  // An internal hostname only resolves inside the provider's own network.
  // Catching this here turns a confusing hang into an immediate explanation.
  if (/\.railway\.internal/.test(dbUrl) && !process.env.RAILWAY_ENVIRONMENT) {
    console.error(
      "DATABASE_URL points at railway.internal, which only resolves inside Railway.\n" +
        "From your own machine use DATABASE_PUBLIC_URL instead (enable it under\n" +
        "the Postgres service -> Settings -> Networking -> Public Access).\n",
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
