"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { users } from "../db/schema";
import { auth } from "../auth";
import { isEmailConfigured } from "../email";

/**
 * Turning the weekly digest on and off.
 *
 * The only way it ever gets turned on. There is no path anywhere that opts
 * somebody in as a side effect of registering, and the column defaults to
 * false — an account is permission to sign in, not permission to be emailed.
 */

export interface DigestPrefResult {
  ok: boolean;
  message?: string;
}

export async function setDigestPreference(enabled: boolean): Promise<DigestPrefResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, message: "Not available on this deployment." };
  }

  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return { ok: false, message: "Sign in to change this." };

  // Turning it *off* always works, even with no mail provider — somebody
  // withdrawing consent must never be blocked by a configuration problem.
  if (enabled && !isEmailConfigured()) {
    return {
      ok: false,
      message: "This deployment cannot send email yet, so the digest would never arrive.",
    };
  }

  try {
    await getDb().update(users).set({ digestOptIn: enabled }).where(eq(users.id, userId));
  } catch {
    return { ok: false, message: "Could not save that just now." };
  }

  revalidatePath("/account");
  return { ok: true };
}

/** Whether the signed-in reader currently receives the digest. */
export async function getDigestPreference(): Promise<{
  enabled: boolean;
  emailConfigured: boolean;
}> {
  const emailConfigured = isEmailConfigured();
  if (!isDatabaseConfigured()) return { enabled: false, emailConfigured };

  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return { enabled: false, emailConfigured };

  try {
    const [row] = await getDb()
      .select({ enabled: users.digestOptIn })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return { enabled: row?.enabled ?? false, emailConfigured };
  } catch {
    return { enabled: false, emailConfigured };
  }
}
