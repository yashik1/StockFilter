-- Which plan a subscriber is on, now that there is more than one to be on.
--
-- Written by hand rather than generated, like every migration here, because
-- drizzle-kit is a dev dependency and is not present in production. Safe to
-- run twice: re-running finds the column already there and does nothing.

-- Defaults to 'pro' deliberately, and the default is the migration's whole
-- correctness argument. Until now this app sold exactly one subscription, so
-- every existing row is someone who bought that one thing. 'pro' is what that
-- thing has become. A default of 'free' would silently strip access from
-- every current payer the moment this ran.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "tier" text NOT NULL DEFAULT 'pro';
--> statement-breakpoint

-- The entitlement read filters by user and reads the tier; the pricing and
-- admin views count by it.
CREATE INDEX IF NOT EXISTS "subscriptions_tier_idx" ON "subscriptions" ("tier");
