import bcrypt from "bcryptjs";

/**
 * Password hashing and the rules a password must meet.
 *
 * Kept in one small module so there is exactly one place that knows how a
 * password becomes a hash — and so nothing else in the app is tempted to
 * handle a raw password itself.
 */

/**
 * bcrypt work factor.
 *
 * 12 is the common recommendation at the time of writing: slow enough that
 * offline guessing against a stolen hash is expensive, fast enough that a
 * sign-in still feels instant. It is stored inside the hash itself, so raising
 * it later re-hashes new passwords without invalidating existing ones.
 */
const WORK_FACTOR = 12;

/**
 * The minimum that is worth enforcing.
 *
 * Length does far more for a password's strength than a required symbol does,
 * and complexity rules mostly push people toward predictable substitutions.
 * So: a floor on length, an upper bound because bcrypt silently ignores bytes
 * past 72 — a limit worth enforcing openly rather than letting someone believe
 * a 200-character passphrase is all being checked.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 72;

export function describePasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  // Measured in bytes, because that is what bcrypt truncates on — a shorter
  // string of multi-byte characters can still exceed the limit.
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return `That is longer than ${MAX_PASSWORD_LENGTH} bytes, which is the most bcrypt reads.`;
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, WORK_FACTOR);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Burns roughly the same time as a real check, for an email that has no
 * account.
 *
 * Without it, "no such user" returns immediately while a real address spends
 * ~200ms hashing, and that difference is measurable from outside — which turns
 * the sign-in form into a way to discover who has an account here. Compares
 * against a fixed hash of a throwaway value; the result is discarded.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.a0RCbfN0hjaFOSGx0GAlDkG5V3aQ0Zq";

export async function equalizeTiming(): Promise<void> {
  await bcrypt.compare("password-that-does-not-matter", DUMMY_HASH);
}
