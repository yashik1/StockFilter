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
        <Field label="Name (optional)" name="name" autoComplete="name" />
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
