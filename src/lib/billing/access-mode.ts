/**
 * What the gated features currently cost.
 *
 * `"sign-in"` opens them to anyone with an account; `"subscription"` requires
 * a paying one. The billing machinery stays wired up either way — Stripe, the
 * webhook, the subscription table and the grace period all keep working and
 * keep recording who has paid — so switching back is this constant and
 * nothing else.
 *
 * Deliberately one flag rather than a condition repeated at each gate. Seven
 * places ask, across pages, an API route and a server action, and a policy
 * spread over seven copies is one that will eventually disagree with itself —
 * which for a paywall means either a locked-out customer or a feature given
 * away for free.
 *
 * This lives in its own leaf module, apart from the entitlement logic that
 * uses it, for one practical reason: the moving-average controls are a client
 * component and need to know which call to action to show. Importing the flag
 * from `entitlement.ts` would drag Drizzle, the database client and Auth.js
 * into the browser bundle behind a single string constant.
 */
export const ACCESS_MODE: "sign-in" | "subscription" = "sign-in";

/** True while an account alone is enough — no payment required. */
export const accountIsEnough = ACCESS_MODE === "sign-in";

/**
 * Whether this visitor may use the gated features, under whichever mode is
 * currently set. The single question every gate should ask.
 *
 * Takes the two booleans it needs rather than the full Entitlement, so it
 * stays in this dependency-free module and can be tested by importing it
 * rather than by copying the rule into a test and hoping the copy stays in
 * step with the original.
 */
export function hasAccess(entitlement: { signedIn: boolean; subscribed: boolean }): boolean {
  return accountIsEnough ? entitlement.signedIn : entitlement.subscribed;
}
