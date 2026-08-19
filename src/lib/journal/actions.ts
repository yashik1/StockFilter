"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { journalEntries } from "../db/schema";
import { getEntitlement } from "../billing/entitlement";
import type { JournalEntry } from "../db/schema";

/**
 * The trade journal — a subscriber's own notes.
 *
 * Every function here re-checks entitlement and scopes to the caller's own
 * userId. Not because the pages do not already gate: because an action is a
 * callable endpoint in its own right, and an authorisation check that lives
 * only in the page it was reached from protects nothing.
 *
 * The ownership check is deliberately part of the WHERE clause rather than an
 * `if` after fetching. Filtering afterwards means a mistyped condition returns
 * somebody else's row before the check runs, and that is exactly the shape of
 * bug that leaks one user's data to another.
 */

export interface JournalResult {
  ok: boolean;
  message: string;
}

const KINDS = new Set(["note", "buy", "sell", "watch"]);
const MAX_TITLE = 200;
const MAX_BODY = 20_000;

async function requireSubscriber(): Promise<{ userId: string } | JournalResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, message: "The journal is unavailable on this deployment." };
  }
  const entitlement = await getEntitlement();
  if (!entitlement.subscribed || !entitlement.userId) {
    return { ok: false, message: "The journal needs a subscription." };
  }
  return { userId: entitlement.userId };
}

function isDenied(v: { userId: string } | JournalResult): v is JournalResult {
  return "ok" in v;
}

export async function listEntries(): Promise<JournalEntry[]> {
  const gate = await requireSubscriber();
  if (isDenied(gate)) return [];

  return getDb()
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.userId, gate.userId))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.id));
}

export async function createEntry(
  _prev: JournalResult | null,
  form: FormData,
): Promise<JournalResult> {
  const gate = await requireSubscriber();
  if (isDenied(gate)) return gate;

  const title = String(form.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Give the entry a title." };
  if (title.length > MAX_TITLE) {
    return { ok: false, message: `Titles are capped at ${MAX_TITLE} characters.` };
  }

  const body = String(form.get("body") ?? "").slice(0, MAX_BODY);
  const kindRaw = String(form.get("kind") ?? "note");
  const kind = KINDS.has(kindRaw) ? kindRaw : "note";

  const symbolRaw = String(form.get("symbol") ?? "").trim().toUpperCase();
  const symbol = symbolRaw ? symbolRaw.slice(0, 20) : null;

  const convictionRaw = Number(form.get("conviction"));
  const conviction =
    Number.isFinite(convictionRaw) && convictionRaw >= 1 && convictionRaw <= 5
      ? Math.round(convictionRaw)
      : null;

  const entryDateRaw = String(form.get("entryDate") ?? "");
  // Falls back to today rather than rejecting: the date is a convenience for
  // ordering, not something worth failing a written-up note over.
  const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(entryDateRaw)
    ? entryDateRaw
    : new Date().toISOString().slice(0, 10);

  await getDb().insert(journalEntries).values({
    userId: gate.userId,
    title,
    body,
    kind,
    symbol,
    conviction,
    entryDate,
  });

  revalidatePath("/journal");
  return { ok: true, message: "Saved." };
}

export async function deleteEntry(
  _prev: JournalResult | null,
  form: FormData,
): Promise<JournalResult> {
  const gate = await requireSubscriber();
  if (isDenied(gate)) return gate;

  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "That entry does not exist." };

  const deleted = await getDb()
    .delete(journalEntries)
    // Both conditions, always. Deleting on id alone would let anyone remove
    // any entry in the table by guessing a number.
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, gate.userId)))
    .returning({ id: journalEntries.id });

  if (deleted.length === 0) {
    // Same message whether the row belongs to someone else or does not exist,
    // so this cannot be used to probe which ids are real.
    return { ok: false, message: "That entry does not exist." };
  }

  revalidatePath("/journal");
  return { ok: true, message: "Deleted." };
}
