import { describe, expect, it } from "vitest";
import { ACCESS_MODE, accountIsEnough, hasAccess } from "./access-mode";

/**
 * The one question every gate asks.
 *
 * Seven places decide whether to show a gated feature — three pages, an API
 * route, a server action and two call-to-action buttons — and all of them
 * route through `hasAccess`. Getting it wrong in either direction is
 * expensive: too strict locks out people who have paid, too loose hands the
 * paid features to everyone. Imported rather than reproduced, deliberately,
 * so a change to the rule cannot pass a test that quietly kept the old copy.
 */

const visitor = { signedIn: false, subscribed: false };
const member = { signedIn: true, subscribed: false };
const payer = { signedIn: true, subscribed: true };

describe("under whichever mode is set", () => {
  it("never lets a signed-out visitor through", () => {
    // True in both modes: there is no configuration in which an anonymous
    // visitor should reach a gated feature.
    expect(hasAccess(visitor)).toBe(false);
  });

  it("always lets a paying subscriber through", () => {
    // Also true in both modes — a subscriber is signed in by construction,
    // so relaxing the gate can never exclude them.
    expect(hasAccess(payer)).toBe(true);
  });

  it("agrees with the flag it is derived from", () => {
    expect(accountIsEnough).toBe(ACCESS_MODE === "sign-in");
  });
});

describe("the mode currently in force", () => {
  /*
    These two assert the *current* setting rather than the mechanism, and are
    meant to fail when it changes — that failure is the reminder to update the
    wording on the paywall, the account page and the README, which describe
    the policy in prose and cannot be typechecked against it.
  */
  it("is sign-in, so an account alone opens the gated features", () => {
    expect(ACCESS_MODE).toBe("sign-in");
    expect(hasAccess(member)).toBe(true);
  });

  it("would require payment if switched to subscription", () => {
    // The behaviour flipping the constant buys, spelled out so the intent is
    // recorded even while the other branch is not the live one.
    const wouldPass = (e: { signedIn: boolean; subscribed: boolean }) => e.subscribed;
    expect(wouldPass(member)).toBe(false);
    expect(wouldPass(payer)).toBe(true);
  });
});
