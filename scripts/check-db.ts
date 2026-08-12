/**
 * Reports the exact state of the database: whether it is reachable, which
 * tables exist, how many rows they hold, and how the last ingest went.
 *
 * Answers "why is the screener empty?" directly instead of by inference.
 *
 *   npm run db:check
 */
import "dotenv/config";
import postgres from "postgres";

const EXPECTED = ["companies", "financials", "scores", "price_cache", "ingest_runs"];

function describeUrl(url: string): string {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${hostname}:${port || 5432}${pathname}`;
  } catch {
    return "set (unparseable)";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.\n");
    console.error("  On Railway: Variables tab -> DATABASE_URL = ${{Postgres.DATABASE_URL}}");
    console.error("  Locally:    put the PUBLIC connection string in .env.local");
    process.exit(1);
  }

  console.log(`Connecting to ${describeUrl(url)}\n`);
  const sql = postgres(url, { max: 1, connect_timeout: 15, prepare: false });

  try {
    const [{ version }] = await sql<{ version: string }[]>`SELECT version()`;
    console.log(`Connected: ${version.split(",")[0]}\n`);

    const present = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const names = new Set(present.map((r) => r.table_name));

    console.log("Tables:");
    let missing = 0;
    for (const table of EXPECTED) {
      if (names.has(table)) {
        const [{ count }] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM ${sql(table)}
        `;
        console.log(`  ${table.padEnd(14)} ${String(count).padStart(6)} rows`);
      } else {
        console.log(`  ${table.padEnd(14)} MISSING`);
        missing++;
      }
    }

    if (missing > 0) {
      console.log(`\n${missing} table(s) missing. Create them with:\n\n  npm run db:migrate\n`);
      process.exitCode = 1;
      return;
    }

    // Surface the most recent ingest so a failed run is visible.
    const runs = await sql<
      { started_at: Date; finished_at: Date | null; processed: number; failed: number; status: string; notes: string | null }[]
    >`
      SELECT started_at, finished_at, processed, failed, status, notes
      FROM ingest_runs ORDER BY started_at DESC LIMIT 3
    `;

    console.log("\nRecent ingest runs:");
    if (runs.length === 0) {
      console.log("  none yet — run:  npm run ingest -- --limit 25");
    } else {
      for (const r of runs) {
        console.log(
          `  ${r.started_at.toISOString()}  ${r.status.padEnd(9)} ${r.processed} ok, ${r.failed} failed`,
        );
        if (r.notes) console.log(`    ${r.notes.slice(0, 200)}`);
      }
    }

    const [{ count: companyCount }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM companies
    `;
    console.log(
      companyCount === 0
        ? "\nSchema is ready but empty. Load data with:\n\n  npm run ingest -- --limit 25\n"
        : `\nEverything looks healthy — ${companyCount} companies loaded.\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  const code = (err as { code?: string }).code;
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    console.error(
      "\nCould not reach the host. A .railway.internal address only resolves inside\n" +
        "Railway — from elsewhere enable Public Access and use DATABASE_PUBLIC_URL.",
    );
  } else if (code === "28P01") {
    console.error("\nThe password in DATABASE_URL was rejected.");
  }
  process.exit(1);
});
