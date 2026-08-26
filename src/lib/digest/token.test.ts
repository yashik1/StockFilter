import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unsubscribeToken, verifyUnsubscribeToken } from "./token";

/**
 * Unsubscribe links.
 *
 * These are the one credential in the app that travels in an email and is
 * accepted without a session, so the properties worth pinning are the ones an
 * attacker would probe: that a signature cannot be swapped between accounts,
 * and that tampering with either half is rejected.
 */

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-secret-for-signing-digest-links";
});

afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = saved;
});

describe("round trip", () => {
  it("recovers the user it was minted for", () => {
    const token = unsubscribeToken("user-abc-123");
    expect(verifyUnsubscribeToken(token)).toBe("user-abc-123");
  });

  it("is stable, so a link in an old email still works", () => {
    expect(unsubscribeToken("user-abc-123")).toBe(unsubscribeToken("user-abc-123"));
  });

  it("gives different users different tokens", () => {
    expect(unsubscribeToken("user-a")).not.toBe(unsubscribeToken("user-b"));
  });

  it("survives a user id with characters that need escaping", () => {
    const id = "user/with+odd=chars";
    expect(verifyUnsubscribeToken(unsubscribeToken(id))).toBe(id);
  });
});

describe("what it rejects", () => {
  /*
    The attack the signature exists to stop: take your own valid link, swap
    the id half for somebody else's, and unsubscribe them.
  */
  it("refuses a signature lifted from another account", () => {
    const mine = unsubscribeToken("user-a");
    const theirSignature = mine.split(".")[1];
    const victim = Buffer.from("user-b").toString("base64url");

    expect(verifyUnsubscribeToken(`${victim}.${theirSignature}`)).toBeNull();
  });

  it("refuses a tampered signature", () => {
    const token = unsubscribeToken("user-a");
    const [id, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.at(-1) === "A" ? "B" : "A");

    expect(verifyUnsubscribeToken(`${id}.${flipped}`)).toBeNull();
  });

  it("refuses a token signed under a different secret", () => {
    const token = unsubscribeToken("user-a");
    process.env.AUTH_SECRET = "a-completely-different-secret-value";

    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("refuses malformed input without throwing", () => {
    for (const bad of ["", ".", "nodot", "a.b.c", "....", "%%%.%%%"]) {
      expect(() => verifyUnsubscribeToken(bad)).not.toThrow();
      expect(verifyUnsubscribeToken(bad)).toBeNull();
    }
  });

  it("returns null rather than throwing when no secret is configured", () => {
    const token = unsubscribeToken("user-a");
    delete process.env.AUTH_SECRET;

    expect(verifyUnsubscribeToken(token)).toBeNull();
  });
});
