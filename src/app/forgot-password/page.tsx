import type { Metadata } from "next";
import { ActionForm, AuthShell, AuthFooterLink, Field } from "@/components/auth/auth-form";
import { requestPasswordReset } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the address you signed up with and we'll send a link to set a new password."
      footer={<AuthFooterLink href="/signin">Back to sign in</AuthFooterLink>}
    >
      <ActionForm action={requestPasswordReset} submitLabel="Send reset link">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
      </ActionForm>
    </AuthShell>
  );
}
