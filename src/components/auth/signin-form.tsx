"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Field, SubmitButton } from "./auth-form";

/**
 * Sign in.
 *
 * Separate from the server-action forms because it calls Auth.js's client
 * `signIn`, which handles the session cookie. Every failure shows the same
 * sentence: the provider deliberately cannot distinguish a wrong password
 * from an unknown address, and inventing a distinction here would give away
 * exactly what that was designed to hide.
 */
export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Only ever an in-app path. A full URL from the query string would let a
  // crafted link bounce someone to another site straight after signing in.
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: data.get("email"),
      password: data.get("password"),
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      setError("That email and password do not match an account.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton label="Sign in" pending={pending} />

      {error && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-poor/30 bg-poor-soft px-3 py-2 text-xs text-poor-fg"
        >
          {error}
        </p>
      )}
    </form>
  );
}
