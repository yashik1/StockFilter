"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, isDatabaseConfigured } from "./db";
import { savedScreeners } from "./db/schema";
import { canAccess, getEntitlement } from "./billing/entitlement";
import type { ScreenFilters } from "./screener";

/**
 * Screens a subscriber saved, and the rules for reading them back.
 *
 * Every function here re-checks the entitlement against the session rather
 * than trusting an argument. A server action is a public HTTP endpoint with a
 * generated name — the fact that the only button pointing at it is behind a
 * paywall says nothing about who can call it.
 */

/** Nobody needs a hundred saved screens, and a cap keeps one account from filling a table. */
const MAX_SAVED = 50;

const MAX_NAME = 60;

export interface SavedScreen {
  id: number;
  name: string;
  filters: ScreenFilters;
  updatedAt: Date;
}

/**
 * Filters as they come back out of JSON.
 *
 * The column holds whatever was written to it, including whatever an older
 * build wrote before a filter was renamed, so this rebuilds a known-good
 * object rather than casting. An unrecognised key is dropped: a saved screen
 * that quietly stops applying one filter is a smaller failure than one that
 * passes a stale key into a query builder.
 */
function parseFilters(raw: unknown): ScreenFilters {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: ScreenFilters = {};

  const numbers = [
    "minHealth", "maxPe", "minFScore", "minMarketCap", "minGrowth",
    "maxPb", "maxPs", "minDividendYield", "minNetMargin", "minRoa",
    "maxDebtToEquity", "minCurrentRatio",
  ] as const;

  for (const key of numbers) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  for (const key of ["safeZoneOnly", "excludeAccountingFlags"] as const) {
    if (input[key] === true) out[key] = true;
  }
  for (const key of ["sector", "country"] as const) {
    const value = input[key];
    if (typeof value === "string" && value) out[key] = value;
  }
  if (typeof input.preset === "string") out.preset = input.preset as ScreenFilters["preset"];
  if (typeof input.sort === "string") out.sort = input.sort as ScreenFilters["sort"];

  return out;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Saves a screen under a name, replacing any screen this account already has by it. */
export async function saveScreen(name: string, filters: ScreenFilters): Promise<SaveResult> {
  const entitlement = await getEntitlement();
  if (!canAccess(entitlement, "SAVED_SCREENERS") || !entitlement.userId) {
    return { ok: false, error: "Saving screens is part of Pro." };
  }
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "There is nowhere to save screens on this deployment." };
  }

  const trimmed = name.trim().slice(0, MAX_NAME);
  if (!trimmed) return { ok: false, error: "Give the screen a name." };

  const db = getDb();

  // Counted before inserting rather than after, so the cap cannot be crossed
  // by two saves arriving together. An update to an existing name is exempt —
  // replacing a screen adds no row.
  const existing = await db
    .select({ id: savedScreeners.id, name: savedScreeners.name })
    .from(savedScreeners)
    .where(eq(savedScreeners.userId, entitlement.userId));

  const replacing = existing.some((row) => row.name === trimmed);
  if (!replacing && existing.length >= MAX_SAVED) {
    return { ok: false, error: `You can keep ${MAX_SAVED} saved screens. Delete one first.` };
  }

  await db
    .insert(savedScreeners)
    .values({ userId: entitlement.userId, name: trimmed, filters })
    .onConflictDoUpdate({
      target: [savedScreeners.userId, savedScreeners.name],
      set: { filters, updatedAt: new Date() },
    });

  revalidatePath("/screen");
  return { ok: true };
}

/** This account's saved screens, most recently touched first. */
export async function listSavedScreens(): Promise<SavedScreen[]> {
  const entitlement = await getEntitlement();
  if (!canAccess(entitlement, "SAVED_SCREENERS") || !entitlement.userId) return [];
  if (!isDatabaseConfigured()) return [];

  const rows = await getDb()
    .select()
    .from(savedScreeners)
    .where(eq(savedScreeners.userId, entitlement.userId))
    .orderBy(desc(savedScreeners.updatedAt))
    .limit(MAX_SAVED);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    filters: parseFilters(row.filters),
    updatedAt: row.updatedAt,
  }));
}

/** Removes one saved screen, if it belongs to the caller. */
export async function deleteSavedScreen(id: number): Promise<SaveResult> {
  const entitlement = await getEntitlement();
  if (!canAccess(entitlement, "SAVED_SCREENERS") || !entitlement.userId) {
    return { ok: false, error: "Saving screens is part of Pro." };
  }
  if (!isDatabaseConfigured()) return { ok: false, error: "No database." };

  /*
    Scoped by user id in the WHERE clause rather than checked after loading.
    A delete that fetches, compares and then deletes has a window between the
    check and the write; this cannot delete somebody else's row at all,
    because the statement never matches one.
  */
  await getDb()
    .delete(savedScreeners)
    .where(and(eq(savedScreeners.id, id), eq(savedScreeners.userId, entitlement.userId)));

  revalidatePath("/screen");
  return { ok: true };
}
