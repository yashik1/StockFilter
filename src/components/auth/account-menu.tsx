"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

/**
 * The header's account control.
 *
 * One thing, not two. It used to be an initial in a box beside a "Sign out"
 * button, which spent about seventy pixels of the header's narrowest region
 * on the one action nobody performs regularly — and took them from the search
 * box, which is the reason most people touch this part of the page at all.
 * Signing out now lives on the account page, next to the account it ends.
 *
 * What is left says who you are, which is the useful thing for a header to
 * report, and goes where you would go to change it.
 *
 * The width is capped rather than left to the name, and capped tighter below
 * 1280 where the whole right-hand band is 320px rather than 400px. An
 * unbounded name was previously why the header could not fit on one row: the
 * bar is held to the same width as the page content so the logo lines up with
 * the text beneath it, and a ten-rem name left 1292px of controls in 1248px of
 * space. Measured rather than guessed — at 1024 with a nine-rem name the search
 * placeholder was still being clipped, which is the fault this change set out
 * to fix. Truncated, with the full name on hover and in the accessible label.
 */
export function AccountMenu({ email, name }: { email: string | null; name?: string | null }) {
  if (!email) {
    return (
      <Link
        href="/signin"
        className="flex h-[34px] shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-strong transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
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
    because everybody has one, so this is never blank.
  */
  const display = name?.trim() || email;

  return (
    <Link
      href="/account"
      title={display === email ? email : `${display} (${email})`}
      aria-label={`Account — signed in as ${display}`}
      className="flex h-[34px] max-w-[6rem] shrink-0 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-muted-strong transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent xl:max-w-[11rem]"
    >
      <span className="truncate">{display}</span>
    </Link>
  );
}

/**
 * Signing out, on the account page.
 *
 * A client component only because next-auth's signOut has to run in the
 * browser; everything else about that page stays on the server.
 */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-strong transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
    >
      Sign out
    </button>
  );
}
