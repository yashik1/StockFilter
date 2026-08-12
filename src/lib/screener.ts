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

export type ScreenStatus = "ok" | "no-database" | "empty";

export interface ScreenResult {
  status: ScreenStatus;
  rows: ScreenRow[];
  total: number;
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
  } catch {
    // A missing table means migrations have not been pushed yet.
    return { status: "empty", rows: [], total: 0 };
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
    return null;
  }
}

export { asc, desc };
