import type { Metadata } from "next";
import { ActionForm, AuthShell, AuthFooterLink, Field } from "@/components/auth/auth-form";
import { signUp } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create an account"
      subtitle="For backtesting and the trade journal. The screener, company pages and charts stay free."
      footer={<AuthFooterLink href="/signin">Already have an account? Sign in</AuthFooterLink>}
    >
      <ActionForm action={signUp} submitLabel="Create account">
        {/* Still optional, and still the `name` field — but presented as a
            username, because that is what a uniqueness rule makes it. Two
            people called John Smith both have a claim on that display name;
            neither has a claim on the same identifier. */}
        <Field
          label="Username (optional)"
          name="name"
          autoComplete="username"
          hint="Shown in the header and on your account. Letters, numbers, dots, dashes and underscores — no spaces."
        />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Length matters more than symbols.`}
        />
      </ActionForm>
    </AuthShell>
  );
}
