import type { Metadata } from "next";
import { ActionForm, AuthShell, AuthFooterLink, Field } from "@/components/auth/auth-form";
import { requestPasswordReset } from "@/lib/auth/actions";
import { isEmailConfigured } from "@/lib/email";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  /*
    Said before the form rather than only after submitting it.

    Without a mail provider the reset link is written to the server log and
    never sent, so the form cannot do the one thing it exists for. Learning
    that after typing an address and waiting for an email that never comes is
    how somebody concludes the site is broken; saying it up front costs
    nothing and leaks nothing, since it is a fact about the deployment rather
    than about any address.
  */
  const canSend = isEmailConfigured();

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the address you signed up with and we'll send a link to set a new password."
      footer={<AuthFooterLink href="/signin">Back to sign in</AuthFooterLink>}
    >
      {!canSend && (
        <p className="mb-4 rounded-lg border border-poor/30 bg-poor-soft px-3 py-2.5 text-xs leading-relaxed text-poor-fg">
          This site has no email provider configured yet, so a reset link cannot be
          delivered. Ask whoever runs it to set a new password for you directly.
        </p>
      )}

      <ActionForm action={requestPasswordReset} submitLabel="Send reset link">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
      </ActionForm>
    </AuthShell>
  );
}
