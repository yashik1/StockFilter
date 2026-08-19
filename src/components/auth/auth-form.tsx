"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/auth/actions";

/**
 * The shared shell for every account form.
 *
 * All four — sign in, sign up, request a reset, set a new password — are the
 * same shape: a heading, a few fields, one button, one message. Sharing the
 * shell keeps them consistent and means the message rendering, which is the
 * part that must never leak whether an address exists, is written once.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md py-10">
      <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>

      <div className="mt-6 rounded-[var(--radius)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
        {children}
      </div>

      {footer && <div className="mt-4 text-sm text-muted">{footer}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={name} className="text-xs text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      />
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity",
        pending ? "cursor-wait opacity-60" : "hover:opacity-90",
      )}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

/**
 * A form driven by one of the auth server actions.
 *
 * The result message is rendered exactly as the action returned it, with no
 * branch that adds detail — those messages are deliberately vague about
 * whether an account exists, and a helpful-looking addition here would undo
 * that.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction}>
      {children}
      <SubmitButton label={submitLabel} pending={pending} />

      {state && (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed",
            state.ok
              ? "border-good/30 bg-good-soft text-good-fg"
              : "border-poor/30 bg-poor-soft text-poor-fg",
          )}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function AuthFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-accent underline">
      {children}
    </Link>
  );
}
