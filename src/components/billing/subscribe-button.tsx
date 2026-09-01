"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Sends the reader to Stripe, either to subscribe or to manage what they have.
 *
 * Both routes are POST — they create a session and cost money to reach, so
 * neither should be triggerable by a prefetch or a link someone else posts.
 */
export function BillingButton({
  endpoint,
  label,
  variant = "primary",
  plan,
  className,
}: {
  endpoint: "checkout" | "portal";
  label: string;
  variant?: "primary" | "secondary";
  /**
   * Which plan to buy. Only a name — the server looks up what that costs from
   * its own configuration, so nothing here decides a price.
   */
  plan?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing/${endpoint}`, {
        method: "POST",
        headers: plan ? { "Content-Type": "application/json" } : undefined,
        body: plan ? JSON.stringify({ plan }) : undefined,
      });
      const json = (await res.json()) as { url?: string; error?: string };

      if (json.url) {
        window.location.href = json.url;
        return;
      }
      setError(json.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Could not reach the payment service. Try again.");
    }
    setPending(false);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className={cn(
          "w-full rounded-lg px-4 py-2 text-sm font-medium transition-opacity",
          variant === "primary"
            ? "bg-accent text-accent-fg hover:opacity-90"
            : "border border-border text-muted-strong hover:text-foreground",
          pending && "cursor-wait opacity-60",
        )}
      >
        {pending ? "Opening…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-poor-fg">{error}</p>}
    </div>
  );
}
