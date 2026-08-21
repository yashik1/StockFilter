import Link from "next/link";
import { Card } from "@/components/ui";
import { BillingButton } from "./subscribe-button";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { accountIsEnough } from "@/lib/billing/access-mode";
import type { Entitlement } from "@/lib/billing/entitlement";

/**
 * What a reader sees in place of a gated feature.
 *
 * The ask depends on what is actually being asked for. While these features
 * need only an account, offering a "Subscribe" button would send somebody to
 * pay for something they can already have — so the whole card changes with
 * ACCESS_MODE rather than only the gate behind it. A paywall that has drifted
 * out of step with its own policy is worse than either version of it.
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
      <p className="eyebrow">{accountIsEnough ? "Free with an account" : "Subscriber feature"}</p>
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
            <Link
              href={`/signup?next=${encodeURIComponent(returnTo)}`}
              className="text-sm text-accent underline"
            >
              or create an account
            </Link>
          </div>
        ) : accountIsEnough ? (
          /*
            Signed in, and an account is all that is needed — so this is not a
            paywall at all and should not look like one. Reaching here means
            the gate and this card disagree about the visitor, which is a bug
            worth saying out loud rather than papering over with an upsell.
          */
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-strong">
            You are signed in, so this should already be open. Reload the page — if it stays
            like this, something is wrong on our side rather than with your account.
          </p>
        ) : !stripeReady ? (
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-strong">
            Payments are not configured on this deployment yet, so there is nothing to
            subscribe to. Everything outside the gated features works as normal.
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

      <div className="mt-5 border-t border-border pt-4">
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
        {accountIsEnough ? (
          <>
            Four things need a free account: the screener backtest, the trade journal, the
            trading strategies, and the moving averages drawn over a result. Everything else
            works signed out — company pages, the screener, comparisons, charts, crypto and
            commodities, and working out what an investment would have been worth.
          </>
        ) : (
          <>
            Four things need a subscription: the screener backtest, the trade journal, the
            trading strategies, and the moving averages drawn over a result. Everything else is
            free — company pages, the screener, comparisons, charts, crypto and commodities, and
            working out what an investment would have been worth.
          </>
          )}
        </p>
      </div>
    </Card>
  );
}
