"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { passwordResetTokens, users } from "../db/schema";
import { sendEmail } from "../email";
import { describePasswordProblem, hashPassword } from "./password";

/**
 * Sign-up and password-reset, as server actions.
 *
 * Two rules run through all of it. Nothing here ever reveals whether a given
 * address has an account — not through the message, not through which branch
 * returns faster — because a form that answers that question is a way to
 * enumerate a customer list. And the raw reset token exists only inside the
 * emailed link: the database holds a SHA-256 of it, so a leaked table cannot
 * be used to take over an account.
 */

export interface ActionResult {
  ok: boolean;
  /** Safe to show a visitor. Never says whether an address is registered. */
  message: string;
}

/** How long a reset link stays valid. Long enough to find the email, short enough to matter. */
const RESET_TTL_MS = 60 * 60 * 1000;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** SHA-256 rather than bcrypt: this is a 256-bit random token, not a guessable secret. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signUp(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = normalizeEmail(form.get("email"));
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  const name = typeof form.get("name") === "string" ? (form.get("name") as string).trim() : "";

  if (!EMAIL_SHAPE.test(email)) {
    return { ok: false, message: "That does not look like an email address." };
  }

  const problem = describePasswordProblem(password);
  if (problem) return { ok: false, message: problem };

  if (!isDatabaseConfigured()) {
    return { ok: false, message: "Accounts are unavailable on this deployment." };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    /*
      Deliberately the same message as a successful sign-up.

      Saying "that email is taken" would turn this form into a way to find out
      who has an account here. Instead the person who owns the address gets an
      email telling them someone tried, which is useful to them and useless to
      anyone fishing.
    */
    await sendEmail({
      to: email,
      subject: "Someone tried to sign up with your email",
      text:
        "Somebody just tried to create a StockFilter account with this address, " +
        "but one already exists.\n\n" +
        "If that was you, sign in instead — or use the forgot-password link if " +
        "you cannot remember it. If it was not you, you can safely ignore this.",
    });
    return { ok: true, message: "Check your email to finish setting up your account." };
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, name: name || null, passwordHash });

  return { ok: true, message: "Check your email to finish setting up your account." };
}

export async function requestPasswordReset(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const email = normalizeEmail(form.get("email"));

  // One message for every outcome below — unknown address, known address,
  // no database. The visitor learns nothing about who is registered.
  const generic: ActionResult = {
    ok: true,
    message: "If that address has an account, a reset link is on its way.",
  };

  if (!EMAIL_SHAPE.test(email) || !isDatabaseConfigured()) return generic;

  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return generic;

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expires: new Date(Date.now() + RESET_TTL_MS),
  });

  const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const link = `${base.replace(/\/$/, "")}/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Reset your StockFilter password",
    text:
      `Use this link to set a new password. It expires in an hour.\n\n${link}\n\n` +
      "If you did not ask for this, ignore it — your password has not changed.",
  });

  return generic;
}

export async function resetPassword(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : "";
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";

  const problem = describePasswordProblem(password);
  if (problem) return { ok: false, message: problem };

  if (!token || !isDatabaseConfigured()) {
    return { ok: false, message: "That reset link is not valid. Request a new one." };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        // Unused and unexpired are checked in the query rather than after it,
        // so a spent or stale token never even comes back.
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expires, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, message: "That reset link has expired or already been used." };
  }

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));

  // Burned immediately, so the same link cannot set a second password.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  return { ok: true, message: "Your password has been changed. You can sign in now." };
}
