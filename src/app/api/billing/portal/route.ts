import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { getSiteUrl, getStripe, isStripeConfigured } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/**
 * Sends a subscriber to Stripe's own billing portal.
 *
 * Cancelling, changing a card and downloading invoices all happen there
 * rather than being rebuilt here — Stripe already handles the tax, dunning
 * and receipt cases correctly, and a homegrown cancel button that silently
 * fails is a much worse outcome than a redirect.
 */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!isStripeConfigured() || !isDatabaseConfigured()) {
    return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!row?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account to manage yet." }, { status: 404 });
  }

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${getSiteUrl()}/account`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("[billing] portal failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not open the billing portal." }, { status: 500 });
  }
}
