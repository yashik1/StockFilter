"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { playbooks, trades, type Playbook, type TradeRow } from "../db/schema";
import { ACCESS_MODE, getEntitlement, hasAccess } from "../billing/entitlement";
import type { Side, Trade } from "./trade-math";

/**
 * Reading and writing the trade journal.
 *
 * Every function re-checks entitlement and scopes to the caller's own userId
 * in the WHERE clause, for the same reason the notes journal does: a server
 * action is a callable endpoint in its own right, and filtering after fetching
 * means somebody else's row is already in hand before the check runs.
 */

export interface TradeResult {
  ok: boolean;
  message: string;
}

const MAX_SYMBOL = 20;
const MAX_NOTES = 20_000;
const MAX_NAME = 120;
const MAX_RULES = 8_000;
/** A bound on what a scripted caller can insert, not a limit anybody will meet. */
const MAX_TRADES = 5_000;

async function requireAccess(): Promise<{ userId: string } | TradeResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, message: "The journal is unavailable on this deployment." };
  }
  const entitlement = await getEntitlement();
  if (!hasAccess(entitlement) || !entitlement.userId) {
    return {
      ok: false,
      message:
        ACCESS_MODE === "sign-in"
          ? "The journal needs an account."
          : "The journal needs a subscription.",
    };
  }
  return { userId: entitlement.userId };
}

function isDenied(v: { userId: string } | TradeResult): v is TradeResult {
  return "ok" in v;
}

/** A required positive number from a form field, or null when unusable. */
function positive(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** An optional number, where empty and unparseable both mean "not set". */
function optional(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isoDate(form: FormData, key: string, fallback?: string): string | null {
  const raw = String(form.get(key) ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback ?? null;
}

/** Maps a stored row onto the shape the maths works in. */
export async function toTrade(row: TradeRow): Promise<Trade> {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side === "short" ? "short" : "long",
    quantity: row.quantity,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    stopPrice: row.stopPrice,
    targetPrice: row.targetPrice,
    fees: row.fees,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    playbookId: row.playbookId,
    followedRules: row.followedRules,
    notes: row.notes,
  };
}

export async function listTrades(): Promise<TradeRow[]> {
  const gate = await requireAccess();
  if (isDenied(gate)) return [];

  return getDb()
    .select()
    .from(trades)
    .where(eq(trades.userId, gate.userId))
    // Open positions surface first, then most recent: the ones still running
    // are the ones a reader has a decision to make about.
    .orderBy(desc(trades.openedAt), desc(trades.id))
    .limit(MAX_TRADES);
}

export async function listPlaybooks(): Promise<Playbook[]> {
  const gate = await requireAccess();
  if (isDenied(gate)) return [];

  return getDb()
    .select()
    .from(playbooks)
    .where(and(eq(playbooks.userId, gate.userId), isNull(playbooks.archivedAt)))
    .orderBy(asc(playbooks.name));
}

export async function createTrade(
  _prev: TradeResult | null,
  form: FormData,
): Promise<TradeResult> {
  const gate = await requireAccess();
  if (isDenied(gate)) return gate;

  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase().slice(0, MAX_SYMBOL);
  if (!symbol) return { ok: false, message: "Which symbol was it?" };

  const quantity = positive(form, "quantity");
  if (quantity == null) return { ok: false, message: "Enter how many shares or contracts." };

  const entryPrice = positive(form, "entryPrice");
  if (entryPrice == null) return { ok: false, message: "Enter the price you got in at." };

  const side: Side = String(form.get("side")) === "short" ? "short" : "long";
  const exitPrice = optional(form, "exitPrice");
  const openedAt = isoDate(form, "openedAt", new Date().toISOString().slice(0, 10))!;
  let closedAt = isoDate(form, "closedAt");

  /*
    A price without a date, or a date without a price, is a half-closed trade
    the maths cannot read: every realised figure keys off both being present.
    Rather than reject the entry, the missing half is filled in — an exit
    price with no date almost always means "today", and a close date with no
    price means the position is still open and the date was a slip.
  */
  if (exitPrice != null && !closedAt) closedAt = new Date().toISOString().slice(0, 10);
  if (exitPrice == null) closedAt = null;

  if (closedAt && closedAt < openedAt) {
    return { ok: false, message: "The closing date is before the opening date." };
  }

  const playbookRaw = Number(form.get("playbookId"));
  const playbookId = Number.isInteger(playbookRaw) && playbookRaw > 0 ? playbookRaw : null;

  // Confirmed against this reader's own strategies, so a forged id cannot
  // attach a trade to somebody else's playbook.
  if (playbookId != null) {
    const [owned] = await getDb()
      .select({ id: playbooks.id })
      .from(playbooks)
      .where(and(eq(playbooks.id, playbookId), eq(playbooks.userId, gate.userId)))
      .limit(1);
    if (!owned) return { ok: false, message: "That strategy does not exist." };
  }

  const followedRaw = String(form.get("followedRules") ?? "");
  const followedRules =
    followedRaw === "yes" ? true : followedRaw === "no" ? false : null;

  await getDb().insert(trades).values({
    userId: gate.userId,
    symbol,
    side,
    quantity,
    entryPrice,
    exitPrice,
    stopPrice: optional(form, "stopPrice"),
    targetPrice: optional(form, "targetPrice"),
    fees: optional(form, "fees") ?? 0,
    openedAt,
    closedAt,
    playbookId,
    followedRules,
    notes: String(form.get("notes") ?? "").slice(0, MAX_NOTES),
  });

  revalidatePath("/journal");
  return { ok: true, message: closedAt ? "Trade logged." : "Position opened." };
}

/** Closes an open position, which is the common follow-up to logging one. */
export async function closeTrade(
  _prev: TradeResult | null,
  form: FormData,
): Promise<TradeResult> {
  const gate = await requireAccess();
  if (isDenied(gate)) return gate;

  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "That trade does not exist." };

  const exitPrice = positive(form, "exitPrice");
  if (exitPrice == null) return { ok: false, message: "Enter the price you got out at." };

  const closedAt = isoDate(form, "closedAt", new Date().toISOString().slice(0, 10))!;
  const followedRaw = String(form.get("followedRules") ?? "");
  const followedRules =
    followedRaw === "yes" ? true : followedRaw === "no" ? false : null;

  const updated = await getDb()
    .update(trades)
    .set({
      exitPrice,
      closedAt,
      ...(followedRules === null ? {} : { followedRules }),
      updatedAt: new Date(),
    })
    // Both conditions, always: on id alone anyone could close any row in the
    // table by guessing a number.
    .where(and(eq(trades.id, id), eq(trades.userId, gate.userId)))
    .returning({ id: trades.id });

  if (updated.length === 0) {
    // Same message whether the row belongs to somebody else or does not
    // exist, so this cannot be used to probe which ids are real.
    return { ok: false, message: "That trade does not exist." };
  }

  revalidatePath("/journal");
  return { ok: true, message: "Trade closed." };
}

export async function deleteTrade(
  _prev: TradeResult | null,
  form: FormData,
): Promise<TradeResult> {
  const gate = await requireAccess();
  if (isDenied(gate)) return gate;

  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "That trade does not exist." };

  const deleted = await getDb()
    .delete(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, gate.userId)))
    .returning({ id: trades.id });

  if (deleted.length === 0) return { ok: false, message: "That trade does not exist." };

  revalidatePath("/journal");
  return { ok: true, message: "Deleted." };
}

export async function createPlaybook(
  _prev: TradeResult | null,
  form: FormData,
): Promise<TradeResult> {
  const gate = await requireAccess();
  if (isDenied(gate)) return gate;

  const name = String(form.get("name") ?? "").trim().slice(0, MAX_NAME);
  if (!name) return { ok: false, message: "Give the strategy a name." };

  try {
    await getDb().insert(playbooks).values({
      userId: gate.userId,
      name,
      description: String(form.get("description") ?? "").slice(0, MAX_RULES),
      rules: String(form.get("rules") ?? "").slice(0, MAX_RULES),
    });
  } catch {
    // The unique index on (userId, name) is the only thing that can fail here.
    return { ok: false, message: `You already have a strategy called "${name}".` };
  }

  revalidatePath("/journal");
  return { ok: true, message: "Strategy added." };
}

/**
 * Retires a strategy without deleting it.
 *
 * Archived rather than removed so the trades that reference it keep their
 * attribution — deleting one would silently re-bucket a year of history into
 * "no strategy" and change every figure computed from it.
 */
export async function archivePlaybook(
  _prev: TradeResult | null,
  form: FormData,
): Promise<TradeResult> {
  const gate = await requireAccess();
  if (isDenied(gate)) return gate;

  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "That strategy does not exist." };

  const updated = await getDb()
    .update(playbooks)
    .set({ archivedAt: new Date() })
    .where(and(eq(playbooks.id, id), eq(playbooks.userId, gate.userId)))
    .returning({ id: playbooks.id });

  if (updated.length === 0) return { ok: false, message: "That strategy does not exist." };

  revalidatePath("/journal");
  return { ok: true, message: "Strategy retired. Its trades keep their history." };
}
