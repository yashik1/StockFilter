import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell, AuthFooterLink } from "@/components/auth/auth-form";
import { SignInForm } from "@/components/auth/signin-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell
      title="Sign in"
      subtitle="Backtesting and the journal need an account. Everything else on the site stays open."
      footer={
        <>
          <AuthFooterLink href="/forgot-password">Forgotten your password?</AuthFooterLink>
          {" · "}
          <AuthFooterLink href="/signup">Create an account</AuthFooterLink>
        </>
      }
    >
      {/* useSearchParams needs a boundary; without one the whole route opts out
          of static rendering and Next says so at build time. */}
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
