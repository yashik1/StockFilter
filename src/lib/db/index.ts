import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database connection.
 *
 * Tuned for serverless: each function instance gets at most one connection and
 * drops it after a short idle period. Postgres allows a bounded number of
 * connections in total, and an unpooled default (10 per instance) exhausts a
 * small Railway instance as soon as traffic fans out.
 *
 * `prepare: false` is required because prepared statements do not survive
 * connection pooling.
 */
let client: ReturnType<typeof postgres> | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Provision a Postgres instance (Railway) and add its " +
        "connection string to your environment. See .env.example.",
    );
  }

  if (!database) {
    client = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    database = drizzle(client, { schema });
  }

  return database;
}

/** Closes the pool. Used by scripts so a CLI run exits cleanly. */
export async function closeDb() {
  await client?.end({ timeout: 5 });
  client = null;
  database = null;
}

export { schema };
export * from "./schema";
