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

/** The single subscription price this app sells. */
export function getPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not set.");
  return priceId;
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
