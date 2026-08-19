/**
 * Outbound email.
 *
 * One function, one provider, and an honest answer when there is no provider
 * at all. Resend is used when a key is present because its free tier is
 * generous and its API is a single POST; anything else would need a
 * dependency for no benefit at this size.
 *
 * When no key is set the message is written to the server log instead of
 * being sent, and `delivered: false` comes back. That matters because the
 * caller must not tell a reader "check your inbox" for a message that was
 * never sent — but it also must not leak, to the person at the form, whether
 * an address exists here. So the honest signal goes to the operator through
 * the return value and the log, never into the page.
 */

export interface EmailResult {
  delivered: boolean;
  /** Why not, when it was not. For the operator, never shown to a visitor. */
  reason?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    // Deliberately logs the whole body. On a deployment with no mail provider
    // this is the only way an operator can complete a password reset at all,
    // and it is strictly better than the flow silently doing nothing.
    console.warn(
      `[email] No RESEND_API_KEY/EMAIL_FROM set — not sending. Would have sent to ${opts.to}:\n` +
        `${opts.subject}\n${opts.text}`,
    );
    return { delivered: false, reason: "no email provider configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      // The body can name the address it refused; keep it out of the log.
      return { delivered: false, reason: `provider returned HTTP ${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    return {
      delivered: false,
      reason: err instanceof Error ? err.message.slice(0, 120) : "send failed",
    };
  }
}
