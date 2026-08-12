/**
 * Creates the database tables.
 *
 * Deliberately does not use drizzle-kit. That is a devDependency, and hosting
 * platforms set NODE_ENV=production and prune those, so `drizzle-kit push`
 * cannot run in a deployed container. This script needs only `postgres`, which
 * the app depends on anyway, so it works everywhere.
 *
 *   npm run db:migrate
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

/** Postgres error codes we treat as "already done" rather than failures. */
const ALREADY_EXISTS = new Set([
  "42P07", // duplicate_table
  "42710", // duplicate_object (index, constraint)
  "42P16", // invalid_table_definition, e.g. re-adding a primary key
]);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set.\n\n" +
        "  On Railway: Variables tab -> DATABASE_URL = ${{Postgres.DATABASE_URL}}\n" +
        "  Locally:    put the PUBLIC connection string in .env.local\n",
    );
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), "drizzle", "0000_init.sql");
  const file = readFileSync(sqlPath, "utf8");

  // drizzle-kit separates statements with this marker.
  const statements = file
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Applying ${statements.length} statements from drizzle/0000_init.sql`);

  const sql = postgres(url, { max: 1, connect_timeout: 15, prepare: false });

  let created = 0;
  let skipped = 0;

  try {
    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
        created++;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code && ALREADY_EXISTS.has(code)) {
          skipped++;
          continue;
        }
        throw err;
      }
    }

    // Prove the tables are actually queryable before reporting success.
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('companies', 'financials', 'scores', 'price_cache', 'ingest_runs')
    `;

    console.log(`\n${created} applied, ${skipped} already existed.`);
    console.log(`${count} of 5 expected tables present.`);

    if (count < 5) {
      console.error("\nSome tables are missing. Check the errors above.");
      process.exitCode = 1;
    } else {
      console.log("\nSchema is ready. Next: npm run ingest -- --limit 25");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  const code = (err as { code?: string }).code;
  console.error("\nMigration failed:", err instanceof Error ? err.message : err);

  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    console.error(
      "\nCould not reach the database. If the host ends in .railway.internal it only\n" +
        "resolves inside Railway — from elsewhere use DATABASE_PUBLIC_URL instead.",
    );
  } else if (code === "28P01") {
    console.error("\nThe password in DATABASE_URL was rejected.");
  }
  process.exit(1);
});
