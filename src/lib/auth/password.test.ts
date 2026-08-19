import { describe, expect, it } from "vitest";
import {
  describePasswordProblem,
  equalizeTiming,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "./password";

/**
 * bcrypt at work factor 12 costs a few hundred milliseconds per hash by
 * design — that slowness is the entire security property. Several of these
 * hash more than once, and under the full suite's CPU contention that runs
 * past vitest's 5s default, so the budget is raised here rather than the work
 * factor being lowered to suit the test runner.
 */
const SLOW_HASHING_MS = 30_000;

/**
 * Password hashing.
 *
 * The properties worth pinning are the ones whose absence is invisible: that
 * the stored value never resembles the password, that two identical passwords
 * do not produce identical hashes, and that the byte limit bcrypt silently
 * enforces is reported rather than hidden.
 */

describe("hashing", () => {
  it("never stores anything resembling the password", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(hash).not.toContain("horse");
    expect(hash.startsWith("$2")).toBe(true);
  }, SLOW_HASHING_MS);

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("a-real-password-1");

    await expect(verifyPassword("a-real-password-1", hash)).resolves.toBe(true);
    await expect(verifyPassword("a-real-password-2", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  }, SLOW_HASHING_MS);

  // Without a per-hash salt, two people choosing the same password would be
  // visibly identical in the table, and one cracked hash would break both.
  it("produces a different hash each time, so identical passwords do not match", async () => {
    const [a, b] = await Promise.all([
      hashPassword("the-same-password"),
      hashPassword("the-same-password"),
    ]);

    expect(a).not.toBe(b);
    // Both still verify — the salt travels inside the hash.
    await expect(verifyPassword("the-same-password", a)).resolves.toBe(true);
    await expect(verifyPassword("the-same-password", b)).resolves.toBe(true);
  }, SLOW_HASHING_MS);

  it("carries the intended work factor", async () => {
    const hash = await hashPassword("anything-at-all");
    // bcrypt encodes the cost in the hash itself: $2a$12$...
    expect(hash).toMatch(/^\$2[aby]?\$12\$/);
  }, SLOW_HASHING_MS);
});

describe("what counts as an acceptable password", () => {
  it("rejects one that is too short", () => {
    expect(describePasswordProblem("short")).toMatch(/at least/i);
    expect(describePasswordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1))).not.toBeNull();
  });

  it("accepts one at the minimum length", () => {
    expect(describePasswordProblem("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  // bcrypt silently ignores bytes past 72. Saying so beats letting someone
  // believe a long passphrase is all being checked.
  it("rejects one longer than bcrypt actually reads", () => {
    const tooLong = "a".repeat(MAX_PASSWORD_LENGTH + 1);
    expect(describePasswordProblem(tooLong)).toMatch(/bcrypt reads/i);
  });

  // The limit is bytes, not characters — an emoji is four of them, so a
  // character count would let a password through that bcrypt then truncates.
  it("measures the limit in bytes, not characters", () => {
    const emoji = "🔐".repeat(19); // 76 bytes, 19 characters
    expect(new TextEncoder().encode(emoji).length).toBeGreaterThan(MAX_PASSWORD_LENGTH);
    expect(describePasswordProblem(emoji)).not.toBeNull();
  });

  it("does not demand symbols or mixed case", () => {
    // Length does more for strength than a required symbol, and complexity
    // rules mostly produce predictable substitutions.
    expect(describePasswordProblem("allalphabetsnodigits")).toBeNull();
  });
});

describe("timing", () => {
  // A sign-in for an unknown address must not return measurably faster than
  // one for a real account, or the form becomes a way to enumerate users.
  it("spends comparable time on a miss as on a real comparison", async () => {
    const hash = await hashPassword("a-real-password-1");

    const realStart = performance.now();
    await verifyPassword("wrong-password-here", hash);
    const realMs = performance.now() - realStart;

    const dummyStart = performance.now();
    await equalizeTiming();
    const dummyMs = performance.now() - dummyStart;

    // Generous bounds: this asserts the same order of magnitude, not a precise
    // match, since CI timing is noisy and a tight bound would flake.
    expect(dummyMs).toBeGreaterThan(realMs * 0.25);
    expect(dummyMs).toBeLessThan(realMs * 4);
  }, SLOW_HASHING_MS);
});
