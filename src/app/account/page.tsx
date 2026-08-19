import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardHeader, Metric } from "@/components/ui";
import { BillingButton } from "@/components/billing/subscribe-button";
import { LocalTime } from "@/components/local-time";
import { getEntitlement } from "@/lib/billing/entitlement";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false } };

/** Stripe's vocabulary, in words a reader can act on. */
const STATUS_TEXT: Record<string, string> = {
  active: "Active",
  trialing: "On trial",
  past_due: "Payment failed — update your card to avoid losing access",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  incomplete: "Not finished",
  incomplete_expired: "Expired before completing",
  paused: "Paused",
};

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/account");

  const params = await searchParams;
  const entitlement = await getEntitlement();
  const justPaid = params.checkout === "done";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-2">
      <header className="pt-1">
        <p className="eyebrow">Account</p>
        <h1 className="font-display mt-2 text-3xl sm:text-4xl">{session.user.email}</h1>
      </header>

      {justPaid && !entitlement.subscribed && (
        <p className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-xs text-muted-strong">
          Payment went through. Stripe confirms subscriptions by webhook, which can take a
          few seconds — refresh in a moment if this page still says otherwise.
        </p>
      )}

      <Card>
        <CardHeader
          title="Subscription"
          subtitle="Backtesting and the trade journal. Everything else on the site is free."
        />
        <dl className="grid grid-cols-2 gap-4 p-5">
          <Metric
            label="Status"
            value={
              entitlement.subscribed
                ? (STATUS_TEXT[entitlement.status ?? ""] ?? "Active")
                : entitlement.status
                  ? (STATUS_TEXT[entitlement.status] ?? entitlement.status)
                  : "No subscription"
            }
            tone={entitlement.subscribed ? "up" : "muted"}
          />
          <div className="min-w-0">
            <dt className="text-xs text-muted">
              {entitlement.cancelAtPeriodEnd ? "Access ends" : "Renews"}
            </dt>
            {/* Rendered here rather than through Metric, which takes a string:
                the date has to go through LocalTime so it reads in the
                subscriber's own timezone rather than the server's. */}
            <dd className="tnum mt-1 text-[0.9375rem] font-semibold">
              {entitlement.currentPeriodEnd ? (
                <LocalTime value={entitlement.currentPeriodEnd.getTime()} mode="date" />
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-3 border-t border-border p-5">
          {!isStripeConfigured() ? (
            <p className="text-xs text-muted">
              Payments are not configured on this deployment yet.
            </p>
          ) : entitlement.subscribed || entitlement.status ? (
            <BillingButton endpoint="portal" label="Manage billing" variant="secondary" />
          ) : (
            <BillingButton endpoint="checkout" label="Subscribe" />
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">What a subscription covers</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          <li>
            <Link href="/backtest" className="text-accent underline">Backtesting</Link>{" "}
            — single stocks and the screener strategy.
          </li>
          <li>
            <Link href="/journal" className="text-accent underline">The trade journal</Link>{" "}
            — your own notes on what you did and why.
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Company pages, the screener, comparisons and charts stay free.
        </p>
      </Card>
    </div>
  );
}
