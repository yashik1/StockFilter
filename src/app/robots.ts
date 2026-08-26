import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * robots.txt.
 *
 * The disallow list is not about hiding anything sensitive — none of these
 * pages will serve another person's data to a crawler, because each checks
 * the session itself. It is about not offering a signed-out form or somebody
 * else's empty journal as a search result, which is the only thing a crawler
 * could ever see there.
 */
/**
 * Rendered per request, not at build.
 *
 * These files are cached by default, which would freeze whatever AUTH_URL
 * happened to be set when the container was built. A build without it ships a
 * robots.txt announcing `Sitemap: http://localhost:3000/sitemap.xml` to every
 * crawler that asks — and unlike a stale page, nothing corrects that until
 * the next deploy.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/account",
        "/journal",
        "/signin",
        "/signup",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
