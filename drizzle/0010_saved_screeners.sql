-- Screens a subscriber built and wants back.
--
-- Hand-written like every migration here, because drizzle-kit is a dev
-- dependency and is absent in production. Safe to run twice.

CREATE TABLE IF NOT EXISTS "saved_screeners" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  -- JSON rather than a column per filter: the filter set is expected to grow,
  -- and a column each would mean a migration every time one is added plus a
  -- table mostly full of nulls. Nothing queries across saved screens, so the
  -- loss of queryability costs nothing here.
  "filters" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Saving over a name replaces that screen rather than creating a second one
-- with the same label, which is what a reader means by saving twice.
CREATE UNIQUE INDEX IF NOT EXISTS "saved_screeners_user_name_idx"
  ON "saved_screeners" ("user_id", "name");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "saved_screeners_user_idx"
  ON "saved_screeners" ("user_id", "updated_at");
