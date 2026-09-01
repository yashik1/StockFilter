import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import {
  availablePlans,
  getSiteUrl,
  getStripe,
  isStripeConfigured,
  priceIdForPlan,
  type Plan,
} from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/**
 * Starts a Stripe Checkout session for the signed-in reader.
 *
 * POST rather than GET: it creates something and costs money to reach, so it
 * should not be triggerable by a link, a prefetch or an image tag pointing at
 * this URL.
 *
 * The price is read from configuration, never from the request. The body may
 * name WHICH plan it wants, but the price id for that plan comes from this
 * server's own environment — taking an amount or a price id from the client
 * would let anyone subscribe for whatever they felt like paying, and taking
 * an unvalidated plan name would let them buy a plan this deployment does not
 * sell.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId || !email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!isStripeConfigured() || !isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured on this deployment." },
      { status: 503 },
    );
  }

  /*
    The plan is the only thing the client gets a say in, and it is checked
    against what this deployment actually sells rather than trusted. An absent
    or unrecognised body falls back to Pro monthly, which is what the single
    price this app used to sell has become — so an older client that posts
    nothing at all still buys the thing it always bought.
  */
  const body = (await request.json().catch(() => null)) as { plan?: string } | null;
  const offered = availablePlans();
  const plan: Plan =
    body?.plan && offered.includes(body.plan as Plan) ? (body.plan as Plan) : "pro-monthly";

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: "That plan is not available on this deployment." },
      { status: 503 },
    );
  }

  const db = getDb();
  const stripe = getStripe();

  try {
    // Reuse the customer if this account already has one, so a resubscribe
    // lands on the same Stripe customer rather than creating a duplicate with
    // a second billing history.
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    let customerId = existing?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        // Lets a webhook identify the account even if the row is missing.
        metadata: { userId },
      });
      customerId = customer.id;

      await db
        .insert(subscriptions)
        .values({ userId, stripeCustomerId: customerId, status: "incomplete" })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: { stripeCustomerId: customerId, updatedAt: new Date() },
        });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${getSiteUrl()}/account?checkout=done`,
      cancel_url: `${getSiteUrl()}/account?checkout=cancelled`,
      // Repeated on the subscription so the webhook can map it back to an
      // account without a database lookup.
      subscription_data: { metadata: { userId } },
      allow_promotion_codes: true,
    });

    if (!checkout.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    // Stripe messages can name internal ids; keep them out of the response and
    // give the reader something they can act on instead.
    console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not start checkout. Try again." }, { status: 500 });
  }
}

/** Kept so a stray GET gets a clear answer rather than a framework 405. */
export async function GET() {
  return NextResponse.json({ error: "Use POST to start checkout." }, { status: 405 });
}
