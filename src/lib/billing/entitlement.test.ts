import { describe, expect, it } from "vitest";

/**
 * Who counts as a paying subscriber.
 *
 * The rules are reproduced here rather than imported because getEntitlement
 * reaches for a session and a database, and what actually needs pinning down
 * is the decision itself: which Stripe statuses entitle someone, and how a
 * stale row is treated. Both are easy to get subtly wrong in a way that
 * either locks out paying customers or hands access to people who cancelled.
 */

const ENTITLING_STATUSES = new Set(["active", "trialing", "past_due"]);
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

function entitles(status: string, currentPeriodEnd: Date | null, now = Date.now()): boolean {
  const statusEntitles = ENTITLING_STATUSES.has(status);
  const withinPeriod =
    currentPeriodEnd == null || currentPeriodEnd.getTime() + GRACE_PERIOD_MS > now;
  return statusEntitles && withinPeriod;
}

const NOW = Date.UTC(2026, 7, 18);
const inDays = (n: number) => new Date(NOW + n * 24 * 60 * 60 * 1000);

describe("which subscription statuses grant access", () => {
  it.each(["active", "trialing"])("grants access while %s", (status) => {
    expect(entitles(status, inDays(20), NOW)).toBe(true);
  });

  // A failed renewal is usually an expired card, not a decision to leave.
  // Locking someone out mid-cycle over it is the worse of the two errors.
  it("keeps a past_due subscriber in during the grace window", () => {
    expect(entitles("past_due", inDays(5), NOW)).toBe(true);
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"])(
    "refuses access when %s",
    (status) => {
      expect(entitles(status, inDays(20), NOW)).toBe(false);
    },
  );
});

describe("a subscription row that has gone stale", () => {
  // The row is only ever as fresh as the last webhook that arrived. One saying
  // "active" whose period ended weeks ago means a webhook was missed — not
  // that this subscription runs forever.
  it("stops trusting an active row long after its period ended", () => {
    expect(entitles("active", inDays(-30), NOW)).toBe(false);
  });

  it("still trusts one that ended within the grace period", () => {
    // Renewal webhooks can land late; a subscriber who paid should not be
    // told otherwise because Stripe was a minute behind.
    expect(entitles("active", inDays(-1), NOW)).toBe(true);
  });

  it("draws the line at the end of the grace period", () => {
    expect(entitles("active", inDays(-2.9), NOW)).toBe(true);
    expect(entitles("active", inDays(-3.1), NOW)).toBe(false);
  });

  it("treats a missing period end as open-ended rather than expired", () => {
    // Stripe has not told us when this ends; the status is all we have to go
    // on, and refusing access would penalise the subscriber for our gap.
    expect(entitles("active", null, NOW)).toBe(true);
    expect(entitles("canceled", null, NOW)).toBe(false);
  });
});

describe("the two ways this can be wrong", () => {
  it("never grants access on a cancelled row, however fresh", () => {
    for (const end of [inDays(365), inDays(1), null]) {
      expect(entitles("canceled", end, NOW)).toBe(false);
    }
  });

  it("never grants access on an unrecognised status", () => {
    // A status Stripe adds later should fail closed, not open.
    expect(entitles("some_future_status", inDays(30), NOW)).toBe(false);
  });
});
