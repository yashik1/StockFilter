/**
 * Where this deployment lives, as an absolute origin.
 *
 * Four things need it and each used to derive it separately: password reset
 * links, Stripe's return URLs, the sitemap, and `metadataBase` for share
 * cards. Three copies of one string is how a deployment ends up emailing
 * links to localhost while its sitemap advertises the right domain.
 *
 * Deliberately taken from configuration rather than the incoming request's
 * Host header, which an attacker controls — a forged Host would otherwise
 * send a real customer to somebody else's site carrying a real checkout
 * session, or publish a sitemap of URLs pointing somewhere we do not own.
 */

/** Railway injects this on every deployment; it is the domain without scheme. */
function fromRailway(): string | null {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : null;
}

function configured(): string | null {
  return (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    fromRailway() ??
    null
  );
}

/** Strips a trailing slash so callers can always append a rooted path. */
function normalise(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * The site origin, falling back to localhost.
 *
 * For everything that must still render when the variable is unset — the
 * sitemap, robots.txt and `metadataBase`. A local dev server has no AUTH_URL
 * and should not 500 on `/sitemap.xml` because of it.
 */
export function siteUrl(): string {
  return normalise(configured() ?? "http://localhost:3000");
}

/**
 * The site origin, or a thrown error.
 *
 * For the cases where guessing is worse than failing: a Stripe checkout that
 * returns the customer to localhost has taken their money and stranded them,
 * which is a far worse outcome than a 500 the operator can see and fix.
 */
export function requireSiteUrl(): string {
  const url = configured();
  if (!url) {
    throw new Error(
      "AUTH_URL is not set, so there is no origin to send people back to.",
    );
  }
  return normalise(url);
}

/** True when the origin came from configuration rather than the fallback. */
export function isSiteUrlConfigured(): boolean {
  return configured() !== null;
}
