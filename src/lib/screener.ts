import { and, asc, desc, eq, gte, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "./db";
import { companies, scores } from "./db/schema";

/**
 * One-click screens, written the way someone would actually ask the question.
 *
 * These are the entry point for people who do not know which ratio to filter
 * on — the whole reason this product exists.
 */
export const PRESETS = {
  healthy: {
    label: "Financially healthy",
    description: "Strong finances across profitability, debt and accounting quality.",
  },
  "cheap-profitable": {
    label: "Cheap & profitable",
    description: "Making real money, but priced modestly against those profits.",
  },
  growing: {
    label: "Growing fast",
    description: "Sales up sharply on last year, without obvious financial strain.",
  },
  dividend: {
    label: "Pays dividends",
    description: "Returns cash to shareholders and stays financially sound.",
  },
  "red-flags": {
    label: "⚠ Red flags",
    description:
      "Companies showing financial distress or unusual accounting. Shown so you can avoid surprises, not as targets.",
  },
} as const;

export type PresetKey = keyof typeof PRESETS;

export const SORTS = {
  health: { label: "Healthiest first", column: scores.healthScore, dir: "desc" },
  "market-cap": { label: "Largest first", column: scores.marketCap, dir: "desc" },
  pe: { label: "Lowest P/E", column: scores.peRatio, dir: "asc" },
  growth: { label: "Fastest growing", column: scores.revenueGrowth, dir: "desc" },
  margin: { label: "Highest margin", column: scores.netMargin, dir: "desc" },
} as const;

export type SortKey = keyof typeof SORTS;

export interface ScreenFilters {
  preset?: PresetKey;
  sector?: string;
  country?: string;
  minHealth?: number;
  maxPe?: number;
  minFScore?: number;
  minMarketCap?: number;
  minGrowth?: number;
  sort?: SortKey;
}

export interface ScreenRow {
  symbol: string;
  name: string;
  sectorKind: string;
  industry: string | null;
  country: string | null;
  healthScore: number | null;
  headline: string | null;
  fScore: number | null;
  fScoreMax: number | null;
  zZone: string | null;
  mFlagged: boolean | null;
  marketCap: number | null;
  peRatio: number | null;
  revenueGrowth: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
}

/**
 * Why a screen returned nothing.
 *
 * These were previously collapsed into `empty`, which meant a database with no
 * tables looked identical to one that was simply not populated yet — and sent
 * people off to re-run an ingest that could never work. Each cause now reports
 * itself.
 */
export type ScreenStatus =
  | "ok"
  /** DATABASE_URL is not set at all. */
  | "no-database"
  /** Connected, tables exist, but no companies have been ingested. */
  | "empty"
  /** Connected, but the tables do not exist — migrations never ran. */
  | "no-tables"
  /** Could not reach or authenticate against the database. */
  | "connection-error";

export interface ScreenResult {
  status: ScreenStatus;
  rows: ScreenRow[];
  total: number;
  /** Safe error detail for the UI. Never contains credentials. */
  detail?: string;
}

/**
 * Finds the underlying driver error.
 *
 * Drizzle wraps failures in a DrizzleQueryError whose message is the full SQL
 * text and whose `code` is undefined — the Postgres error code lives on
 * `.cause`. Reading only the outer error misclassifies every failure and dumps
 * an unreadable query at the user, so the chain is walked to the root.
 */
function rootCause(err: unknown): { code?: string; message: string } {
  let current: unknown = err;
  const seen = new Set<unknown>();

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: string }).code;
    if (typeof code === "string" && code.length > 0) {
      return { code, message: (current as Error).message ?? String(current) };
    }
    current = (current as { cause?: unknown }).cause;
  }

  return { message: err instanceof Error ? err.message : String(err) };
}

/** Maps a driver error onto the specific cause, so the UI can be precise. */
function classifyDbError(err: unknown): { status: ScreenStatus; detail: string } {
  const { code, message } = rootCause(err);

  // 42P01 undefined_table — the schema was never created.
  if (code === "42P01") {
    return {
      status: "no-tables",
      detail: "The database is reachable but the tables do not exist yet.",
    };
  }
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    return {
      status: "connection-error",
      detail:
        "Could not reach the database. If the host ends in .railway.internal it only " +
        "resolves inside Railway — from elsewhere use the public connection string.",
    };
  }
  if (code === "28P01") {
    return {
      status: "connection-error",
      detail: "The database rejected the password in DATABASE_URL.",
    };
  }
  if (code === "3D000") {
    return {
      status: "connection-error",
      detail: "That database name does not exist on the server.",
    };
  }
  return {
    status: "connection-error",
    detail: safeDetail(message),
  };
}

/**
 * Prepares an error message for display: strips anything resembling a
 * connection string, drops the SQL body Drizzle appends, and truncates.
 */
function safeDetail(message: string): string {
  const withoutSql = message.replace(/Failed query:[\s\S]*/i, "").trim();
  const cleaned = (withoutSql || message)
    .replace(/postgres(ql)?:\/\/\S+/gi, "[connection string]")
    .trim();
  return cleaned.length > 300 ? `${cleaned.slice(0, 300)}…` : cleaned;
}

/** Translates a preset into concrete conditions. */
function presetConditions(preset: PresetKey): SQL[] {
  switch (preset) {
    case "healthy":
      return [gte(scores.healthScore, 7.5)];
    case "cheap-profitable":
      return [
        isNotNull(scores.peRatio),
        gte(scores.peRatio, 0),
        lte(scores.peRatio, 18),
        gte(scores.netMargin, 0.05),
        gte(scores.healthScore, 6),
      ];
    case "growing":
      return [gte(scores.revenueGrowth, 0.15), gte(scores.healthScore, 5)];
    case "dividend":
      return [gte(scores.dividendYield, 0.015), gte(scores.healthScore, 5.5)];
    case "red-flags":
      // Any one of these is enough to warrant a closer look.
      return [
        or(
          eq(scores.mFlagged, true),
          eq(scores.zZone, "distress"),
          lte(scores.healthScore, 4),
        )!,
      ];
  }
}

/**
 * Runs a screen against the precomputed scores table.
 *
 * Reads only from the database — no external API calls — which is what lets a
 * universe-wide filter return instantly and for free.
 */
export async function runScreen(filters: ScreenFilters, limit = 100): Promise<ScreenResult> {
  if (!isDatabaseConfigured()) {
    return { status: "no-database", rows: [], total: 0 };
  }

  const db = getDb();
  const conditions: SQL[] = [eq(companies.isActive, true)];

  if (filters.preset) conditions.push(...presetConditions(filters.preset));
  if (filters.sector) conditions.push(eq(companies.sectorKind, filters.sector));
  if (filters.country) conditions.push(eq(companies.country, filters.country));
  if (filters.minHealth != null) conditions.push(gte(scores.healthScore, filters.minHealth));
  if (filters.maxPe != null) {
    conditions.push(isNotNull(scores.peRatio), gte(scores.peRatio, 0), lte(scores.peRatio, filters.maxPe));
  }
  if (filters.minFScore != null) conditions.push(gte(scores.fScore, filters.minFScore));
  if (filters.minMarketCap != null) conditions.push(gte(scores.marketCap, filters.minMarketCap));
  if (filters.minGrowth != null) conditions.push(gte(scores.revenueGrowth, filters.minGrowth));

  const sort = SORTS[filters.sort ?? "health"];
  // NULLS LAST everywhere: a company with no data should never top a ranking.
  const orderBy =
    sort.dir === "desc"
      ? sql`${sort.column} DESC NULLS LAST`
      : sql`${sort.column} ASC NULLS LAST`;

  try {
    const rows = await db
      .select({
        symbol: companies.symbol,
        name: companies.name,
        sectorKind: companies.sectorKind,
        industry: companies.industry,
        country: companies.country,
        healthScore: scores.healthScore,
        headline: scores.headline,
        fScore: scores.fScore,
        fScoreMax: scores.fScoreMax,
        zZone: scores.zZone,
        mFlagged: scores.mFlagged,
        marketCap: scores.marketCap,
        peRatio: scores.peRatio,
        revenueGrowth: scores.revenueGrowth,
        netMargin: scores.netMargin,
        debtToEquity: scores.debtToEquity,
      })
      .from(companies)
      .innerJoin(scores, eq(scores.companyId, companies.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit);

    return {
      status: rows.length === 0 ? "empty" : "ok",
      rows,
      total: rows.length,
    };
  } catch (err) {
    const { status, detail } = classifyDbError(err);
    return { status, rows: [], total: 0, detail };
  }
}

/** Top companies by health score, for the dashboard. */
export async function getHealthiest(limit = 8): Promise<ScreenResult> {
  return runScreen({ minHealth: 7, sort: "health" }, limit);
}

/** How many companies have been ingested, for setup messaging. */
export async function getUniverseCount(): Promise<number | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies);
    return row?.count ?? 0;
  } catch {
    // Null means "could not determine", distinct from a genuine zero.
    return null;
  }
}

export { asc, desc };

/** Exposed for tests only. */
export const __testing = { classifyDbError, rootCause, safeDetail };
