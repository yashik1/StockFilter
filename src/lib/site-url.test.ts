import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSiteUrlConfigured, requireSiteUrl, siteUrl } from "./site-url";

/**
 * Where this deployment thinks it lives.
 *
 * Worth pinning because the two callers want opposite behaviour from the same
 * missing variable: a sitemap must still render, and a Stripe checkout must
 * not silently send a paying customer to localhost.
 */

const KEYS = ["AUTH_URL", "NEXTAUTH_URL", "RAILWAY_PUBLIC_DOMAIN"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("resolving the origin", () => {
  it("prefers AUTH_URL", () => {
    process.env.AUTH_URL = "https://example.com";
    process.env.NEXTAUTH_URL = "https://ignored.example";
    expect(siteUrl()).toBe("https://example.com");
  });

  it("falls back to NEXTAUTH_URL", () => {
    process.env.NEXTAUTH_URL = "https://legacy.example";
    expect(siteUrl()).toBe("https://legacy.example");
  });

  it("derives an origin from the Railway domain, which carries no scheme", () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = "stockfilter-production.up.railway.app";
    expect(siteUrl()).toBe("https://stockfilter-production.up.railway.app");
  });

  /*
    Every caller appends a rooted path. A trailing slash left in place turns
    every sitemap URL and every reset link into a double slash, which some
    crawlers treat as a separate page.
  */
  it("strips a trailing slash", () => {
    process.env.AUTH_URL = "https://example.com/";
    expect(siteUrl()).toBe("https://example.com");
    expect(`${siteUrl()}/sitemap.xml`).toBe("https://example.com/sitemap.xml");
  });
});

describe("when nothing is configured", () => {
  it("still yields a usable origin, so a sitemap renders locally", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
    expect(isSiteUrlConfigured()).toBe(false);
  });

  /*
    The opposite direction, deliberately. A checkout that returns the customer
    to localhost has taken their money and stranded them — a visible failure
    the operator can fix is the better outcome.
  */
  it("throws for the callers that must not guess", () => {
    expect(() => requireSiteUrl()).toThrow(/AUTH_URL/);
  });
});
