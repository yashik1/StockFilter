import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Company universe. Populated by the ingest job from the seed list plus SEC
 * metadata. `sectorKind` is derived from the SIC code and drives which scoring
 * models apply.
 */
export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    cik: text("cik"),
    name: text("name").notNull(),
    exchange: text("exchange"),
    country: text("country"),
    sicCode: text("sic_code"),
    sicDescription: text("sic_description"),
    /** financial | real-estate | manufacturing | other — gates which scoring
        models apply. Deliberately coarse; not for display. */
    sectorKind: text("sector_kind").notNull().default("other"),
    /** Familiar market sector for grouping and the heatmap. */
    displaySector: text("display_sector").notNull().default("Other"),
    industry: text("industry"),
    logoUrl: text("logo_url"),
    website: text("website"),
    /** Canadian companies cross-listed on US exchanges are flagged for filtering. */
    isCanadian: boolean("is_canadian").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("companies_symbol_idx").on(t.symbol),
    index("companies_sector_idx").on(t.sectorKind),
    index("companies_display_sector_idx").on(t.displaySector),
  ],
);

/**
 * One row per company per fiscal year, in canonical fields.
 *
 * Stored as double precision: values reach the trillions but stay far inside the
 * 2^53 exact-integer range, and every downstream use is a ratio.
 */
export const financials = pgTable(
  "financials",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    fiscalYear: integer("fiscal_year").notNull(),
    endDate: text("end_date").notNull(),
    form: text("form"),
    currency: text("currency").default("USD"),
    /**
     * ISO date the filing carrying these figures was submitted to the SEC —
     * distinct from `endDate`, which is the period the figures describe. A
     * FY2020 10-K is typically filed six to ten weeks into 2021, so a reader
     * who only knew what was public on, say, 2021-01-15 could not yet have
     * seen these numbers. Backtesting a "buy the healthy companies" strategy
     * without this distinction quietly cheats: it scores 2020 using 2020's
     * results before those results existed.
     *
     * Nullable because it depends on the SEC payload's own `filed` field,
     * which fallback providers (Yahoo, Alpha Vantage, EODHD) never carry — see
     * their comments in src/lib/providers/. A row with no filedAt should be
     * excluded from point-in-time reconstruction, not assumed current.
     */
    filedAt: text("filed_at"),

    assets: doublePrecision("assets"),
    liabilities: doublePrecision("liabilities"),
    equity: doublePrecision("equity"),
    currentAssets: doublePrecision("current_assets"),
    currentLiabilities: doublePrecision("current_liabilities"),
    cash: doublePrecision("cash"),
    receivables: doublePrecision("receivables"),
    inventory: doublePrecision("inventory"),
    ppe: doublePrecision("ppe"),
    longTermDebt: doublePrecision("long_term_debt"),
    shortTermDebt: doublePrecision("short_term_debt"),
    retainedEarnings: doublePrecision("retained_earnings"),

    revenue: doublePrecision("revenue"),
    costOfRevenue: doublePrecision("cost_of_revenue"),
    grossProfit: doublePrecision("gross_profit"),
    operatingIncome: doublePrecision("operating_income"),
    netIncome: doublePrecision("net_income"),
    incomeBeforeTax: doublePrecision("income_before_tax"),
    interestExpense: doublePrecision("interest_expense"),
    sga: doublePrecision("sga"),
    depreciation: doublePrecision("depreciation"),

    operatingCashFlow: doublePrecision("operating_cash_flow"),
    capex: doublePrecision("capex"),
    dividendsPaid: doublePrecision("dividends_paid"),
    sharesOutstanding: doublePrecision("shares_outstanding"),

    /** Link back to the filing these figures came from. */
    sourceFilingUrl: text("source_filing_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("financials_company_year_idx").on(t.companyId, t.fiscalYear)],
);

/**
 * Precomputed scores — the table the screener reads.
 *
 * Screening never fans out to external APIs; it queries only this table, which
 * is what makes a universe-wide filter fast and free.
 */
export const scores = pgTable(
  "scores",
  {
    companyId: integer("company_id")
      .primaryKey()
      .references(() => companies.id, { onDelete: "cascade" }),
    fiscalYear: integer("fiscal_year"),

    /** 0-10 composite. Null when too little was reported to judge. */
    healthScore: doublePrecision("health_score"),

    fScore: integer("f_score"),
    fScoreMax: integer("f_score_max"),

    zScore: doublePrecision("z_score"),
    zZone: text("z_zone"),
    zApplicable: boolean("z_applicable").notNull().default(false),

    mScore: doublePrecision("m_score"),
    mFlagged: boolean("m_flagged"),
    mApplicable: boolean("m_applicable").notNull().default(false),

    marketCap: doublePrecision("market_cap"),
    peRatio: doublePrecision("pe_ratio"),
    pbRatio: doublePrecision("pb_ratio"),
    psRatio: doublePrecision("ps_ratio"),
    dividendYield: doublePrecision("dividend_yield"),

    revenueGrowth: doublePrecision("revenue_growth"),
    netMargin: doublePrecision("net_margin"),
    returnOnAssets: doublePrecision("return_on_assets"),
    debtToEquity: doublePrecision("debt_to_equity"),
    currentRatio: doublePrecision("current_ratio"),

    /**
     * Latest quote, refreshed separately from the nightly fundamentals pass.
     * Movers and the sector heatmap read these rather than fanning out to a
     * price API per symbol, which no free tier would sustain.
     */
    price: doublePrecision("price"),
    changePercent: doublePrecision("change_percent"),
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),

    /** Cached plain-English question output, so pages render without recompute. */
    questions: jsonb("questions"),
    headline: text("headline"),

    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scores_health_idx").on(t.healthScore),
    index("scores_market_cap_idx").on(t.marketCap),
    index("scores_pe_idx").on(t.peRatio),
    index("scores_f_idx").on(t.fScore),
    index("scores_change_idx").on(t.changePercent),
  ],
);

/** Cached OHLCV series, keyed by symbol and timeframe. */
export const priceCache = pgTable(
  "price_cache",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    bars: jsonb("bars").notNull(),
    fromDate: timestamp("from_date", { withTimezone: true }).notNull(),
    toDate: timestamp("to_date", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("price_cache_key_idx").on(t.symbol, t.timeframe)],
);

/** Audit trail for ingest runs, so a partial or failed refresh is visible. */
export const ingestRuns = pgTable("ingest_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  processed: integer("processed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  status: text("status").notNull().default("running"),
  notes: text("notes"),
});

export type Company = typeof companies.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type Financial = typeof financials.$inferSelect;
