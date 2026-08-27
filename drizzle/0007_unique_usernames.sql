-- One account per username, compared without regard to case.
--
-- The column has been free text since it was added, so the data has to be made
-- to satisfy the constraint before the constraint can exist. Each step below
-- is safe to run twice: re-running finds nothing left to change, which matters
-- because this migration runner replays every file every time.

-- An empty string is not a username. Left as-is, every account that submitted
-- a blank one would collide with every other on the index below.
UPDATE "users" SET "name" = NULL WHERE "name" IS NOT NULL AND btrim("name") = '';
--> statement-breakpoint

-- Surrounding whitespace makes two identical names look distinct to a human
-- and to the index alike.
UPDATE "users" SET "name" = btrim("name") WHERE "name" IS NOT NULL AND "name" <> btrim("name");
--> statement-breakpoint

-- Any genuine duplicates keep the earliest registration's name; the rest get a
-- slice of their own id appended. Ugly, and only ever applied to rows that
-- were already ambiguous — the alternative is a migration that fails on data
-- the application previously allowed.
UPDATE "users" u
SET "name" = u."name" || '-' || left(u."id", 8)
FROM (
  SELECT "id",
         row_number() OVER (PARTITION BY lower("name") ORDER BY "created_at", "id") AS rn
  FROM "users"
  WHERE "name" IS NOT NULL
) dup
WHERE u."id" = dup."id" AND dup.rn > 1;
--> statement-breakpoint

-- Functional so that case cannot be used to register a lookalike, and partial
-- so that the accounts with no username do not all collide on NULL.
CREATE UNIQUE INDEX "users_name_lower_idx" ON "users" (lower("name")) WHERE "name" IS NOT NULL;
