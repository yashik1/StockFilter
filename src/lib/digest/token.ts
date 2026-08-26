import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Unsubscribe links that work without signing in.
 *
 * Somebody who wants to stop receiving an email should not have to remember a
 * password to do it — a one-click link is the standard, and making it harder
 * converts unsubscribes into spam reports, which is worse for everybody.
 *
 * The token is an HMAC of the user id under AUTH_SECRET, so it is verifiable
 * without storing anything: nothing goes in the database, and a leaked
 * database yields no working unsubscribe links. It deliberately carries no
 * expiry — an unsubscribe link in a two-year-old email must still work.
 *
 * Its authority is narrow by construction. It proves only "the holder of this
 * link was sent a digest for this account", which is enough to turn the
 * digest off and enough for nothing else. It is never accepted as a session.
 */

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set, so digest links cannot be signed.");
  return value;
}

function sign(userId: string): string {
  return createHmac("sha256", secret())
    .update(`digest-unsubscribe:${userId}`)
    .digest("base64url");
}

/** The token to put in a link. Carries the user id so the route knows who to act on. */
export function unsubscribeToken(userId: string): string {
  return `${Buffer.from(userId).toString("base64url")}.${sign(userId)}`;
}

/**
 * The user id a token vouches for, or null.
 *
 * Compared with `timingSafeEqual` rather than `===`. A string comparison
 * returns as soon as it finds a differing byte, which leaks how much of a
 * guess was right and turns forging a signature into a solvable problem.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const [encodedId, signature] = token.split(".");
  if (!encodedId || !signature) return null;

  let userId: string;
  try {
    userId = Buffer.from(encodedId, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!userId) return null;

  let expected: string;
  try {
    expected = sign(userId);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length is checked first because timingSafeEqual throws on a mismatch, and
  // a length difference is not secret anyway.
  if (a.length !== b.length) return null;

  return timingSafeEqual(a, b) ? userId : null;
}
