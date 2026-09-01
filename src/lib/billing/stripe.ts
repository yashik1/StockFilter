import Stripe from "stripe";
import { requireSiteUrl } from "../site-url";

/**
 * The Stripe client, and the settings it needs.
 *
 * Everything is read from the environment at call time rather than at import
 * time, so a deployment without Stripe configured still boots and serves every
 * free page — only the checkout route refuses, and it says why.
 */

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set, so payments cannot be taken.");
  }
  // Reused across requests: the client is a thin HTTP wrapper and rebuilding
  // it per call throws away connection reuse for nothing.
  client ??= new Stripe(key);
  return client;
}

/**
 * The original single price, kept working.
 *
 * This app sold one subscription before it sold three, and `STRIPE_PRICE_ID`
 * is what an existing deployment has set. It is now the fallback for Pro
 * monthly, so a deployment that never adds the new variables keeps taking the
 * payments it was already taking.
 */
export function getPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not set.");
  return priceId;
}

/** A plan somebody can actually buy: a tier crossed with a billing period. */
export type Plan = "pro-monthly" | "pro-yearly" | "pro-plus-monthly" | "pro-plus-yearly";

/**
 * Which environment variable holds each plan's price.
 *
 * Pro monthly falls back to the original `STRIPE_PRICE_ID` so nothing that
 * works today stops working; the rest are additive and simply unavailable
 * until configured.
 */
const PLAN_ENV: Readonly<Record<Plan, readonly string[]>> = {
  "pro-monthly": ["STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRICE_ID"],
  "pro-yearly": ["STRIPE_PRO_YEARLY_PRICE_ID"],
  "pro-plus-monthly": ["STRIPE_PRO_PLUS_MONTHLY_PRICE_ID"],
  "pro-plus-yearly": ["STRIPE_PRO_PLUS_YEARLY_PRICE_ID"],
};

/** The configured price for a plan, or null when this deployment does not sell it. */
export function priceIdForPlan(plan: Plan): string | null {
  for (const name of PLAN_ENV[plan]) {
    const value = process.env[name];
    if (value) return value;
  }
  return null;
}

/** Which plans this deployment can actually take money for. */
export function availablePlans(): Plan[] {
  return (Object.keys(PLAN_ENV) as Plan[]).filter((p) => priceIdForPlan(p) !== null);
}

/**
 * Which tier a Stripe price id grants.
 *
 * Resolved when a subscription is bought or changed, and then stored on the
 * row — see the note on `subscriptions.tier`. Returns null for a price this
 * deployment does not recognise, which the caller must treat as "leave the
 * tier alone" rather than as "free": an unrecognised price is far more likely
 * to be a rotated environment variable than a customer who bought nothing,
 * and demoting a paying customer over a config change is the worse error.
 */
export function tierForPriceId(priceId: string | null | undefined): "pro" | "pro-plus" | null {
  if (!priceId) return null;

  for (const plan of ["pro-plus-monthly", "pro-plus-yearly"] as const) {
    if (priceIdForPlan(plan) === priceId) return "pro-plus";
  }
  for (const plan of ["pro-monthly", "pro-yearly"] as const) {
    if (priceIdForPlan(plan) === priceId) return "pro";
  }
  return null;
}

/**
 * The origin Stripe should send people back to.
 *
 * Throws rather than guessing, which is the right direction to fail here:
 * a checkout that returns the customer to localhost has taken their money
 * and stranded them. See src/lib/site-url.ts for why this comes from
 * configuration rather than the request's Host header.
 */
export function getSiteUrl(): string {
  return requireSiteUrl();
}
