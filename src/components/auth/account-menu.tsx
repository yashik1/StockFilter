"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

/**
 * The header's account control.
 *
 * Deliberately small: a link when signed out, an initial and a way out when
 * signed in. The subscription state is not shown here — it is read fresh on
 * the pages that gate on it, and a badge in the header would be one more
 * place for that answer to go stale.
 *
 * The name or address is not printed in full. It used to be, and at up to ten rem it
 * was most of the reason the header could not fit on one row: the bar is
 * capped at the same width as the page content so the logo lines up with the
 * text beneath it, which left 1248px to hold 1292px of controls. Signed out it
 * fitted, signed in it wrapped, so the layout broke precisely for the people
 * using the account features. An address is also not what anybody needs read
 * back to them on every page — it is on the account page, on hover, and to a
 * screen reader through the label.
 */
export function AccountMenu({ email, name }: { email: string | null; name?: string | null }) {
  if (!email) {
    return (
      <Link
        href="/signin"
        className="shrink-0 rounded-lg border border-transparent bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted-strong transition-colors hover:text-accent"
      >
        Sign in
      </Link>
    );
  }

  /*
    The name if there is one, the address if not.

    A name is optional at sign-up, so it cannot be relied on — but when
    somebody has given one it is what they would expect to be called, and
    "attur.yashik@gmail.com" is not a name. The address remains the fallback
    because everybody has one, which keeps the circle from ever being blank.
  */
  const display = name?.trim() || email;
  const initial = display.charAt(0).toUpperCase();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href="/account"
        title={display === email ? email : `${display} (${email})`}
        aria-label={`Account — signed in as ${display}`}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[0.6875rem] font-semibold text-muted-strong ring-1 ring-border transition-colors hover:text-accent hover:ring-accent"
      >
        {initial}
      </Link>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
