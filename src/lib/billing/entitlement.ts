import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { subscriptions } from "../db/schema";
import { auth } from "../auth";

/**
 * Who is allowed to use the paid features.
 *
 * One module, one answer. Every gate in the app asks this rather than reading
 * subscription rows itself, so "what counts as paid" is defined once and
 * cannot drift between the page that shows a feature and the route that
 * serves it — which is the usual way a paywall ends up leaking.
 */

/**
 * Stripe statuses that entitle someone to paid features.
 *
 * `trialing` counts: a trial is access the customer was deliberately given.
 * `past_due` also counts, for a grace period — a card that failed to renew is
 * usually a expired card rather than a decision to leave, and locking someone
 * out mid-billing-cycle over it is a worse error than a few days of unpaid
 * access. `canceled`, `unpaid` and `incomplete` do not.
 */
const ENTITLING_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * How long past `currentPeriodEnd` a subscription still counts.
 *
 * Stripe's webhook for a renewal can arrive late, and the row is only ever as
 * fresh as the last webhook that landed. Without some slack, a subscriber who
 * renewed successfully could be told they are not subscribed because a
 * webhook was delayed by a minute. Three days is long enough to cover a
 * missed webhook and short enough that a genuinely lapsed subscription does
 * not linger.
 */
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

export interface Entitlement {
  signedIn: boolean;
  subscribed: boolean;
  userId: string | null;
  /** Stripe's own status, for showing the reader something specific. */
  status: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

const NOT_SIGNED_IN: Entitlement = {
  signedIn: false,
  subscribed: false,
  userId: null,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

/**
 * Reads the current visitor's entitlement, fresh, on every call.
 *
 * Deliberately not cached on the session token. A token minted while someone
 * was subscribed would go on asserting it until the token expired, which
 * means a cancellation would not take effect for days — and, worse, the same
 * staleness would hand access back to someone whose payment had failed.
 */
export async function getEntitlement(): Promise<Entitlement> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return NOT_SIGNED_IN;
  if (!isDatabaseConfigured()) {
    return { ...NOT_SIGNED_IN, signedIn: true, userId };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!row) {
    return { ...NOT_SIGNED_IN, signedIn: true, userId };
  }

  const statusEntitles = ENTITLING_STATUSES.has(row.status);
  // A row still saying "active" long after its period ended means a webhook
  // was missed, not that the subscription runs forever.
  const withinPeriod =
    row.currentPeriodEnd == null ||
    row.currentPeriodEnd.getTime() + GRACE_PERIOD_MS > Date.now();

  return {
    signedIn: true,
    subscribed: statusEntitles && withinPeriod,
    userId,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
}
