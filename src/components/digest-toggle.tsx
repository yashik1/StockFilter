"use client";

import { useState, useTransition } from "react";
import { setDigestPreference } from "@/lib/digest/actions";
import { cn } from "@/lib/utils";

/**
 * The weekly digest switch.
 *
 * A real checkbox rather than a styled div, so it is reachable by keyboard
 * and announced as a checkbox by a screen reader without any ARIA to keep in
 * step with it.
 *
 * The state flips immediately and rolls back if the write fails, because a
 * consent control that appears not to respond invites a second click — and
 * for a mailing preference, a reader who cannot tell whether they turned it
 * off is exactly the reader who reports the next message as spam.
 */
export function DigestToggle({
  initialEnabled,
  emailConfigured,
}: {
  initialEnabled: boolean;
  emailConfigured: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setDigestPreference(next);
      if (!result.ok) {
        setEnabled(!next);
        setError(result.message ?? "Could not save that.");
      }
    });
  }

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending || (!emailConfigured && !enabled)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span className={cn("text-sm", pending && "opacity-70")}>
          <span className="font-medium">Email me a weekly summary</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
            What your saved companies filed that week — results, insider trades, and the
            handful of filings that are worth reading the same day. Taken from the SEC, so
            it carries no prices. One email a week at most, and none at all in a quiet week.
          </span>
        </span>
      </label>

      {!emailConfigured && !enabled && (
        <p className="mt-2 text-xs text-muted">
          This deployment has no email provider configured, so the digest cannot be sent yet.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-poor">{error}</p>}
    </div>
  );
}
