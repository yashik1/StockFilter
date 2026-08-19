import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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

/* ------------------------------------------------------------------ accounts
 *
 * Auth.js owns the shape of the four tables below — `users`, `accounts`,
 * `sessions` and `verificationTokens` are what its Drizzle adapter expects,
 * with those exact column names. They are hand-written here rather than
 * imported so the whole schema stays in one file and one migration path, but
 * the shape is not ours to redesign: renaming a column breaks the adapter.
 *
 * `passwordHash` is the one addition. Auth.js has no opinion about passwords —
 * its Credentials provider hands you whatever the form submitted and expects
 * you to decide — so the hash lives here, and nothing anywhere in this app
 * ever stores or logs the password itself.
 */
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  /** bcrypt hash. Null for an account created through an OAuth provider. */
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * Password reset tokens.
 *
 * Deliberately separate from `verificationTokens`, which Auth.js uses for its
 * own email flows — sharing that table would mean a reset link and a sign-in
 * link are indistinguishable, so consuming one could silently satisfy the
 * other.
 *
 * Only a hash of the token is stored. The raw token goes in the emailed link
 * and nowhere else, so a leaked database still cannot be used to reset
 * anyone's password.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_token_hash_idx").on(t.tokenHash),
    index("password_reset_user_idx").on(t.userId),
  ],
);

/* -------------------------------------------------------------- subscriptions
 *
 * Stripe is the source of truth for whether someone has paid; this table is a
 * local cache of what its webhooks last told us. Entitlement is therefore
 * checked against `status` and `currentPeriodEnd` together — a row saying
 * "active" whose period ended a week ago means a webhook was missed, not that
 * the subscriber is still entitled.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    /** Stripe's own vocabulary: active, trialing, past_due, canceled, unpaid… */
    status: text("status").notNull().default("incomplete"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_customer_idx").on(t.stripeCustomerId),
    index("subscriptions_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------- journal
 *
 * A subscriber's own trading notes. Nothing here comes from a market data
 * provider, which is what makes it the one paid feature carrying no data
 * licensing exposure at all.
 *
 * `symbol` is free text rather than a foreign key to `companies`: a journal
 * entry may well be about something outside the screening universe, and an
 * entry should never be deleted because its ticker left the index.
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** buy | sell | watch | note — what the entry is about. */
    kind: text("kind").notNull().default("note"),
    /** The reader's own conviction, 1-5, for reviewing decisions later. */
    conviction: integer("conviction"),
    entryDate: text("entry_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_user_date_idx").on(t.userId, t.entryDate),
    index("journal_user_symbol_idx").on(t.userId, t.symbol),
  ],
);

export type Company = typeof companies.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type Financial = typeof financials.$inferSelect;
export type User = typeof users.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
