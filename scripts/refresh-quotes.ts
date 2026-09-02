/**
 * Refreshes stored quotes for the screening universe.
 *
 * Separate from the fundamentals ingest because the two change at completely
 * different rates: filings quarterly, prices constantly. Run this as often as
 * your price plan allows — Finnhub's free tier permits 60 requests a minute, so
 * the full universe takes roughly ten minutes.
 *
 *   npm run quotes
 *   npm run quotes -- --limit 50
 *   npm run quotes -- AAPL MSFT RY
 */
import "dotenv/config";
import { closeDb } from "../src/lib/db";
import { refreshQuotes } from "../src/lib/ingest";
import { getUniverse } from "../src/lib/universe";

async function main() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("DATABASE_URL is not set — there is nowhere to store quotes.");
    process.exit(1);
  }

  // An internal hostname only resolves inside Railway's own network — this
  // workflow runs on a GitHub-hosted runner, outside it. Without this check the
  // connection just fails deep inside the postgres driver with a raw network
  // error; this turns that into an immediate, actionable explanation. Mirrors
  // the same guard in scripts/ingest.ts.
  if (/\.railway\.internal/.test(dbUrl) && !process.env.RAILWAY_ENVIRONMENT) {
    console.error(
      "DATABASE_URL points at railway.internal, which only resolves inside Railway.\n" +
        "Use the Postgres service's PUBLIC connection string instead (Railway ->\n" +
        "Postgres service -> Connect -> Public Network).\n",
    );
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  const symbols: string[] = [];
  let limit: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      limit = Number(argv[++i]);
    } else if (!argv[i].startsWith("--")) {
      symbols.push(argv[i].toUpperCase());
    }
  }

  let targets = symbols.length > 0 ? symbols : getUniverse();
  if (limit && limit > 0) targets = targets.slice(0, limit);

  console.log(`Refreshing quotes for ${targets.length} symbols...`);
  console.log();

  const started = Date.now();

  try {
    const result = await refreshQuotes(targets, (done, total) => {
      const pct = Math.round((done / total) * 100);
      process.stdout.write(`\r  [${String(pct).padStart(3)}%] ${done}/${total}   `);
    });

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log();
    console.log();
    console.log(`Done in ${seconds}s — ${result.updated} updated, ${result.failed} failed.`);

    if (result.errors.length > 0) {
      console.log();
      console.log("First failures:");
      for (const e of result.errors.slice(0, 10)) console.log(`  ${e}`);
    }

    await closeDb();
    // No updates at all means nothing worked, which should fail a scheduled run.
    process.exit(result.updated === 0 ? 1 : 0);
  } catch (err) {
    console.log();
    console.error(err instanceof Error ? err.message : String(err));
    await closeDb();
    process.exit(1);
  }
}

main();
