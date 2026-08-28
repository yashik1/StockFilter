-- Who owned each company, from the quarterly Form 13F filings, and the CUSIP
-- crosswalk needed to find those filings by ticker.
--
-- Written by hand rather than generated, like every migration here, because
-- drizzle-kit is a dev dependency and is not present in production. Every
-- statement is safe to run twice: this runner replays every file every time.

CREATE TABLE IF NOT EXISTS "institutional_holdings" (
  "id" serial PRIMARY KEY,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  -- The quarter held on, e.g. 2026-03-31. Text rather than date because it is
  -- an identifier for a reporting period, always compared and never arithmetic.
  "quarter" text NOT NULL,
  "manager_cik" text NOT NULL,
  "manager_name" text NOT NULL,
  "shares" double precision,
  "value" double precision,
  -- Summary of every manager that reported the company, not only the ones
  -- stored. See the note in schema.ts on why these repeat across the rows.
  "holder_count" integer,
  "total_shares" double precision
);
--> statement-breakpoint

-- One row per manager per company per quarter. Without this an amended 13F
-- adds a second row instead of replacing the first, which double-counts the
-- largest holders on every large company — Vanguard appeared twice on Apple
-- with two different valuations in the raw data this was built from.
CREATE UNIQUE INDEX IF NOT EXISTS "institutional_company_quarter_manager_idx"
  ON "institutional_holdings" ("company_id", "quarter", "manager_cik");
--> statement-breakpoint

-- The read path always asks for one company's most recent quarters.
CREATE INDEX IF NOT EXISTS "institutional_company_quarter_idx"
  ON "institutional_holdings" ("company_id", "quarter");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cusip_symbols" (
  "cusip" text PRIMARY KEY,
  "symbol" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cusip_symbol_idx" ON "cusip_symbols" ("symbol");
