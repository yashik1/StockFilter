import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyUnsubscribeToken } from "@/lib/digest/token";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe.
 *
 * Answers HTML rather than JSON: this URL is opened by a person clicking a
 * link in an email client, not by a script, and a page of JSON reads as a
 * failure to somebody who just wanted the mail to stop.
 *
 * Accepts GET, which is unusual for a state change and correct here. Mail
 * clients and their link scanners issue GETs, and the alternative — a landing
 * page with a confirm button — is one more thing between a person and the
 * outcome they already asked for. The token's authority is narrow enough for
 * that to be safe: it turns off one flag on one account and can do nothing
 * else, so a scanner following it costs somebody a digest they can switch
 * back on, not access to anything.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const userId = token ? verifyUnsubscribeToken(token) : null;

  if (!userId) {
    return page(
      "That link is not valid",
      "It may have been altered in transit. You can turn the weekly digest off from your account page at any time.",
      400,
    );
  }

  if (!isDatabaseConfigured()) {
    return page(
      "Not available right now",
      "This deployment has no database configured, so the setting could not be changed.",
      503,
    );
  }

  try {
    await getDb().update(users).set({ digestOptIn: false }).where(eq(users.id, userId));
  } catch {
    return page(
      "Something went wrong",
      "The setting could not be changed just now. You can also turn the digest off from your account page.",
      500,
    );
  }

  return page(
    "Unsubscribed",
    "You will not receive the weekly digest again. Your account and your saved companies are untouched — you can turn it back on from your account page whenever you like.",
    200,
  );
}

/**
 * A minimal styled page.
 *
 * Deliberately standalone rather than rendered through the app's layout: this
 * has to work for somebody who is not signed in, in whatever client opened
 * the link, and the fewer moving parts between them and "it stopped" the
 * better. Colours are the theme's own, inlined, because there is no
 * stylesheet on this response.
 */
function page(title: string, body: string, status: number): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · StockFilter</title>
<style>
  :root { color-scheme: light dark; --bg:#f2f2f3; --fg:#1d1f20; --muted:#5d5d60; --border:#c8c9ca; --accent:#416180; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#14191e; --fg:#e7eaec; --muted:#a4acb2; --border:#3c4348; --accent:#8db0d1; }
  }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:var(--bg); color:var(--fg); padding:24px;
         font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:34rem; border:1px solid var(--border); padding:32px; }
  h1 { margin:0 0 12px; font-size:1.5rem; font-weight:600; letter-spacing:-0.01em; }
  p { margin:0 0 20px; color:var(--muted); }
  a { color:var(--accent); }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
  <p><a href="/">Back to StockFilter</a></p>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
