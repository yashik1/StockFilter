ALTER TABLE "companies" ADD COLUMN "display_sector" text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "price" double precision;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "change_percent" double precision;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "price_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "companies_display_sector_idx" ON "companies" USING btree ("display_sector");--> statement-breakpoint
CREATE INDEX "scores_change_idx" ON "scores" USING btree ("change_percent");