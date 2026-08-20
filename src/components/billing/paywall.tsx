import Link from "next/link";
import { Card } from "@/components/ui";
import { BillingButton } from "./subscribe-button";
import { isStripeConfigured } from "@/lib/billing/stripe";
import type { Entitlement } from "@/lib/billing/entitlement";

/**
 * What a reader sees in place of a paid feature.
 *
 * Three different situations, three different asks: signed out, signed in but
 * not subscribed, and a deployment with no payments configured at all. Showing
 * "Subscribe" to somebody who cannot subscribe — because Stripe is not set up
 * — would be a dead end, so that case says so plainly instead.
 *
 * The tone is deliberately not a hard sell. Everything else on the site is
 * free and stays free, and this says which parts are which rather than
 * implying the reader is missing out on the whole product.
 */
export function Paywall({
  entitlement,
  feature,
  description,
  returnTo,
}: {
  entitlement: Entitlement;
  feature: string;
  description: string;
  returnTo: string;
}) {
  const stripeReady = isStripeConfigured();

  return (
    <Card className="p-6">
      <p className="eyebrow">Subscriber feature</p>
      <h2 className="font-display mt-2 text-2xl">{feature}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>

      <div className="mt-5">
        {!entitlement.signedIn ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/signin?next=${encodeURIComponent(returnTo)}`}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
            <Link href="/signup" className="text-sm text-accent underline">
              or create an account
            </Link>
          </div>
        ) : !stripeReady ? (
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-strong">
            Payments are not configured on this deployment yet, so there is nothing to
            subscribe to. Everything outside backtesting and the journal works as normal.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <BillingButton endpoint="checkout" label="Subscribe" />
            <Link href="/account" className="text-sm text-muted underline">
              Manage account
            </Link>
          </div>
        )}
      </div>

      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted">
        Four things need a subscription: the screener backtest, the trade journal, the trading
        strategies, and the moving averages drawn over a result. Everything else is free —
        company pages, the screener, comparisons, charts, crypto and commodities, and working
        out what an investment would have been worth.
      </p>
    </Card>
  );
}
