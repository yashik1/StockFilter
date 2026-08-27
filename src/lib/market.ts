import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "./db";
import { companies, scores } from "./db/schema";

/**
 * Market-wide views for the dashboard.
 *
 * Everything here reads the stored quote written by `refreshQuotes`, never a
 * price API directly. Fetching a live quote per company would need hundreds of
 * requests per page view, which no free plan sustains — and the whole point of
 * precomputing is that the dashboard stays instant and free.
 */

export interface Mover {
  symbol: string;
  name: string;
  displaySector: string;
  price: number | null;
  changePercent: number | null;
  healthScore: number | null;
  marketCap: number | null;
}

export interface SectorPerformance {
  sector: string;
  /** Mean daily change across companies in the sector. */
  averageChange: number;
  companyCount: number;
  /** Largest company in the sector, as a recognisable example. */
  leader: string | null;
}

export interface MarketSnapshot {
  gainers: Mover[];
  losers: Mover[];
  sectors: SectorPerformance[];
  /** When the underlying quotes were last written. */
  asOf: Date | null;
  /** How many companies have a usable quote. */
  covered: number;
  /**
   * How many days old the stored quotes are, or null when unknown.
   *
   * Computed here rather than in the component. Freshness is a property of
   * the data that was fetched, not of the moment it happens to be rendered —
   * and reading the clock during render is both impure and, on a cached page,
   * frozen at whenever that page was built.
   */
  ageDays: number | null;
}

/** Days between a stored timestamp and now, or null when it is unusable. */
function ageInDays(asOf: Date | null): number | null {
  if (!asOf) return null;
  const ms = asOf.getTime();
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 86_400_000;
}

const EMPTY: MarketSnapshot = {
  gainers: [],
  losers: [],
  sectors: [],
  asOf: null,
  covered: 0,
  ageDays: null,
};

/**
 * Ignore microcap noise in the movers list.
 *
 * Without a floor the biggest movers are almost always tiny illiquid names,
 * which is true but useless — a reader looking at "today's movers" means
 * companies they might recognise.
 */
const MIN_MARKET_CAP = 2e9;

/** Companies needed in a sector before its average means anything. */
const MIN_SECTOR_MEMBERS = 3;

export async function getMarketSnapshot(limit = 5): Promise<MarketSnapshot> {
  if (!isDatabaseConfigured()) return EMPTY;

  try {
    const db = getDb();

    const base = and(
      eq(companies.isActive, true),
      isNotNull(scores.changePercent),
      isNotNull(scores.price),
    );

    const select = {
      symbol: companies.symbol,
      name: companies.name,
      displaySector: companies.displaySector,
      price: scores.price,
      changePercent: scores.changePercent,
      healthScore: scores.healthScore,
      marketCap: scores.marketCap,
    };

    const [gainers, losers, sectorRows, meta] = await Promise.all([
      db
        .select(select)
        .from(companies)
        .innerJoin(scores, eq(scores.companyId, companies.id))
        .where(and(base, sql`(${scores.marketCap} IS NULL OR ${scores.marketCap} >= ${MIN_MARKET_CAP})`))
        .orderBy(desc(scores.changePercent))
        .limit(limit),

      db
        .select(select)
        .from(companies)
        .innerJoin(scores, eq(scores.companyId, companies.id))
        .where(and(base, sql`(${scores.marketCap} IS NULL OR ${scores.marketCap} >= ${MIN_MARKET_CAP})`))
        .orderBy(sql`${scores.changePercent} ASC`)
        .limit(limit),

      db
        .select({
          sector: companies.displaySector,
          averageChange: sql<number>`avg(${scores.changePercent})::float8`,
          companyCount: sql<number>`count(*)::int`,
          leader: sql<string>`(array_agg(${companies.symbol} ORDER BY ${scores.marketCap} DESC NULLS LAST))[1]`,
        })
        .from(companies)
        .innerJoin(scores, eq(scores.companyId, companies.id))
        .where(base)
        .groupBy(companies.displaySector)
        .having(sql`count(*) >= ${MIN_SECTOR_MEMBERS}`),

      db
        .select({
          asOf: sql<Date | null>`max(${scores.priceUpdatedAt})`,
          covered: sql<number>`count(${scores.price})::int`,
        })
        .from(scores),
    ]);

    const asOf = meta[0]?.asOf ? new Date(meta[0].asOf) : null;

    return {
      gainers,
      // A "loser" that actually rose means everything moved up today; the UI
      // filters those out rather than mislabelling them.
      losers: losers.filter((l) => (l.changePercent ?? 0) < 0),
      sectors: sectorRows
        .map((s) => ({ ...s, averageChange: Number(s.averageChange) }))
        .sort((a, b) => b.averageChange - a.averageChange),
      asOf,
      covered: meta[0]?.covered ?? 0,
      ageDays: ageInDays(asOf),
    };
  } catch {
    // Missing tables or an unreachable database: the dashboard hides these
    // sections rather than breaking the whole page.
    return EMPTY;
  }
}

/** True when there is enough stored quote data for the market views. */
export function hasMarketData(snapshot: MarketSnapshot): boolean {
  return snapshot.covered > 0 && (snapshot.gainers.length > 0 || snapshot.sectors.length > 0);
}
