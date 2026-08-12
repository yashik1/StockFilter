CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"cik" text,
	"name" text NOT NULL,
	"exchange" text,
	"country" text,
	"sic_code" text,
	"sic_description" text,
	"sector_kind" text DEFAULT 'other' NOT NULL,
	"industry" text,
	"logo_url" text,
	"website" text,
	"is_canadian" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financials" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"fiscal_year" integer NOT NULL,
	"end_date" text NOT NULL,
	"form" text,
	"currency" text DEFAULT 'USD',
	"assets" double precision,
	"liabilities" double precision,
	"equity" double precision,
	"current_assets" double precision,
	"current_liabilities" double precision,
	"cash" double precision,
	"receivables" double precision,
	"inventory" double precision,
	"ppe" double precision,
	"long_term_debt" double precision,
	"short_term_debt" double precision,
	"retained_earnings" double precision,
	"revenue" double precision,
	"cost_of_revenue" double precision,
	"gross_profit" double precision,
	"operating_income" double precision,
	"net_income" double precision,
	"income_before_tax" double precision,
	"interest_expense" double precision,
	"sga" double precision,
	"depreciation" double precision,
	"operating_cash_flow" double precision,
	"capex" double precision,
	"dividends_paid" double precision,
	"shares_outstanding" double precision,
	"source_filing_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"processed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "price_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"bars" jsonb NOT NULL,
	"from_date" timestamp with time zone NOT NULL,
	"to_date" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"company_id" integer PRIMARY KEY NOT NULL,
	"fiscal_year" integer,
	"health_score" double precision,
	"f_score" integer,
	"f_score_max" integer,
	"z_score" double precision,
	"z_zone" text,
	"z_applicable" boolean DEFAULT false NOT NULL,
	"m_score" double precision,
	"m_flagged" boolean,
	"m_applicable" boolean DEFAULT false NOT NULL,
	"market_cap" double precision,
	"pe_ratio" double precision,
	"pb_ratio" double precision,
	"ps_ratio" double precision,
	"dividend_yield" double precision,
	"revenue_growth" double precision,
	"net_margin" double precision,
	"return_on_assets" double precision,
	"debt_to_equity" double precision,
	"current_ratio" double precision,
	"questions" jsonb,
	"headline" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financials" ADD CONSTRAINT "financials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_symbol_idx" ON "companies" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "companies_sector_idx" ON "companies" USING btree ("sector_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "financials_company_year_idx" ON "financials" USING btree ("company_id","fiscal_year");--> statement-breakpoint
CREATE UNIQUE INDEX "price_cache_key_idx" ON "price_cache" USING btree ("symbol","timeframe");--> statement-breakpoint
CREATE INDEX "scores_health_idx" ON "scores" USING btree ("health_score");--> statement-breakpoint
CREATE INDEX "scores_market_cap_idx" ON "scores" USING btree ("market_cap");--> statement-breakpoint
CREATE INDEX "scores_pe_idx" ON "scores" USING btree ("pe_ratio");--> statement-breakpoint
CREATE INDEX "scores_f_idx" ON "scores" USING btree ("f_score");