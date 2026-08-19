"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

/**
 * The header's account control.
 *
 * Deliberately small: a link when signed out, a name and a way out when
 * signed in. The subscription state is not shown here — it is read fresh on
 * the pages that gate on it, and a badge in the header would be one more
 * place for that answer to go stale.
 */
export function AccountMenu({ email }: { email: string | null }) {
  if (!email) {
    return (
      <Link
        href="/signin"
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-strong transition-colors hover:border-accent hover:text-accent"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/account"
        className="max-w-[10rem] truncate text-xs text-muted-strong transition-colors hover:text-accent"
        title={email}
      >
        {email}
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
