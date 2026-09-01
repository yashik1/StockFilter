import type { Plan } from "./stripe";
import type { Tier } from "./tiers";

/**
 * What each plan costs and what it says on the pricing page.
 *
 * Prices are in whole dollars per period, stated here rather than fetched from
 * Stripe. That is a deliberate trade: a page that fetches its own prices is
 * always correct but costs a network round trip on a route that should be
 * instant and cacheable, and these change roughly never. The Stripe price id
 * remains the thing that is actually charged — if these two ever disagree, the
 * customer pays what Stripe says, and the mismatch is a copy bug rather than a
 * billing one.
 *
 * Kept apart from `stripe.ts` so a client component can import the copy
 * without pulling the Stripe SDK into the browser bundle.
 */

export interface PlanCopy {
  readonly plan: Plan;
  readonly tier: Exclude<Tier, "free">;
  readonly period: "month" | "year";
  /** Whole dollars for the period. */
  readonly price: number;
}

export const PLAN_COPY: readonly PlanCopy[] = [
  { plan: "pro-monthly", tier: "pro", period: "month", price: 9.99 },
  { plan: "pro-yearly", tier: "pro", period: "year", price: 79 },
  { plan: "pro-plus-monthly", tier: "pro-plus", period: "month", price: 19.99 },
  { plan: "pro-plus-yearly", tier: "pro-plus", period: "year", price: 149 },
];

export function planFor(tier: Exclude<Tier, "free">, period: "month" | "year"): PlanCopy {
  const found = PLAN_COPY.find((p) => p.tier === tier && p.period === period);
  if (!found) throw new Error(`No plan configured for ${tier} ${period}.`);
  return found;
}

/**
 * What a yearly plan works out at per month.
 *
 * Shown because "$79/year" is hard to compare against "$9.99/month" at a
 * glance, and a reader doing that arithmetic in their head is a reader who has
 * stopped reading. Rounded to cents, not dressed up.
 */
export function monthlyEquivalent(yearly: number): number {
  return Math.round((yearly / 12) * 100) / 100;
}

/**
 * How much less the yearly plan costs than paying monthly for a year.
 *
 * Computed rather than written down. A hardcoded "save 34%!" is the kind of
 * claim that quietly becomes false the first time a price moves, and an
 * incorrect saving on a pricing page is a consumer-protection problem rather
 * than a typo. Returns null when there is nothing to claim.
 */
export function yearlySaving(tier: Exclude<Tier, "free">): number | null {
  const monthly = planFor(tier, "month").price;
  const yearly = planFor(tier, "year").price;
  const fullPrice = monthly * 12;
  if (yearly >= fullPrice) return null;
  return Math.round(((fullPrice - yearly) / fullPrice) * 100);
}

/** Formats a price the way the page shows it: no trailing `.00`. */
export function formatPrice(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}
