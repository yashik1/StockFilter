import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../db";
import { users, watchlistItems } from "../db/schema";
import { isEmailConfigured, sendEmail } from "../email";
import { siteUrl } from "../site-url";
import { composeDigest, digestSubject, renderDigest } from "./compose";
import { unsubscribeToken } from "./token";

/**
 * Sending the weekly digest.
 *
 * Separated from the route so the composition and the guards can be tested
 * without an HTTP request, and so a dry run is a parameter rather than a
 * different code path — the thing you rehearse should be the thing that runs.
 */

/**
 * How long must pass before somebody is due another digest.
 *
 * Six days rather than seven. A weekly cron never fires at exactly the same
 * instant, so a strict seven-day gate would skip a week roughly whenever the
 * run drifted a minute later — and the *point* of the gate is preventing a
 * duplicate, not enforcing an exact period.
 */
const MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000;

export interface DigestRunResult {
  ok: boolean;
  /** Accounts opted in and past their gap. */
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  message?: string;
  /** Per-recipient outcome. Carries no email addresses. */
  detail: { userId: string; items: number; outcome: string }[];
}

export async function runDigest(options: { dryRun?: boolean; limit?: number } = {}): Promise<DigestRunResult> {
  const { dryRun = false, limit = 200 } = options;
  const empty: DigestRunResult = {
    ok: false, due: 0, sent: 0, skipped: 0, failed: 0, dryRun, detail: [],
  };

  if (!isDatabaseConfigured()) {
    return { ...empty, message: "DATABASE_URL is not configured." };
  }
  if (!dryRun && !isEmailConfigured()) {
    // Refused rather than attempted. sendEmail would log each message and
    // report delivered:false, and this loop would then stamp digestLastSentAt
    // — suppressing the real digest for a week once mail was configured.
    return { ...empty, message: "No email provider is configured; refusing to run." };
  }

  const db = getDb();
  const cutoff = new Date(Date.now() - MIN_GAP_MS);

  const due = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.digestOptIn, true),
        // Never sent, or last sent long enough ago. This is the idempotency
        // gate: a retried or redelivered cron finds nobody due.
        or(isNull(users.digestLastSentAt), lt(users.digestLastSentAt, cutoff)),
      ),
    )
    .limit(limit);

  const result: DigestRunResult = { ...empty, ok: true, due: due.length };
  const base = siteUrl();

  for (const user of due) {
    const saved = await db
      .select({ symbol: watchlistItems.symbol })
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, user.id));

    if (saved.length === 0) {
      // Nothing saved means nothing to summarise. Deliberately not stamped as
      // sent: the moment they save something, they are due.
      result.skipped++;
      result.detail.push({ userId: user.id, items: 0, outcome: "nothing-saved" });
      continue;
    }

    const digest = await composeDigest(saved.map((s) => s.symbol)).catch(() => null);
    if (!digest) {
      result.failed++;
      result.detail.push({ userId: user.id, items: 0, outcome: "compose-failed" });
      continue;
    }

    /*
      A quiet week is not worth an email.

      Most weeks most companies file nothing, and a digest that arrives every
      Monday to say "nothing happened" is the kind of mail people stop reading
      and then report. Not stamping the date means a genuinely eventful week
      goes out as soon as it arrives rather than waiting for the next slot.
    */
    if (digest.items.length === 0) {
      result.skipped++;
      result.detail.push({ userId: user.id, items: 0, outcome: "quiet-week" });
      continue;
    }

    if (dryRun) {
      result.skipped++;
      result.detail.push({ userId: user.id, items: digest.items.length, outcome: "dry-run" });
      continue;
    }

    const unsubscribeUrl = `${base}/api/digest/unsubscribe?token=${encodeURIComponent(
      unsubscribeToken(user.id),
    )}`;

    const delivery = await sendEmail({
      to: user.email,
      subject: digestSubject(digest),
      text: renderDigest(digest, unsubscribeUrl),
    });

    if (!delivery.delivered) {
      // Left un-stamped so the next run tries again rather than swallowing
      // the week.
      result.failed++;
      result.detail.push({ userId: user.id, items: digest.items.length, outcome: "send-failed" });
      continue;
    }

    await db
      .update(users)
      .set({ digestLastSentAt: new Date() })
      .where(eq(users.id, user.id));

    result.sent++;
    result.detail.push({ userId: user.id, items: digest.items.length, outcome: "sent" });
  }

  return result;
}
