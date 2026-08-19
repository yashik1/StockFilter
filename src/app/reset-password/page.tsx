import type { Metadata } from "next";
import { ActionForm, AuthShell, AuthFooterLink, Field } from "@/components/auth/auth-form";
import { resetPassword } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const metadata: Metadata = {
  title: "Set a new password",
  // A reset link should never end up in a search index or an analytics
  // referrer, since the token in the query string is the whole secret.
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (!token) {
    return (
      <AuthShell
        title="Set a new password"
        subtitle="This link is missing its token, so there is nothing to reset."
        footer={<AuthFooterLink href="/forgot-password">Request a new link</AuthFooterLink>}
      >
        <p className="text-sm text-muted">
          Reset links expire after an hour and can only be used once. Requesting a fresh one
          takes a moment.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose something you have not used elsewhere."
      footer={<AuthFooterLink href="/signin">Back to sign in</AuthFooterLink>}
    >
      <ActionForm action={resetPassword} submitLabel="Change password">
        {/* The token rides in a hidden field rather than being read from the
            URL inside the action — a server action does not see the page's
            query string. */}
        <input type="hidden" name="token" value={token} />
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        />
      </ActionForm>
    </AuthShell>
  );
}
