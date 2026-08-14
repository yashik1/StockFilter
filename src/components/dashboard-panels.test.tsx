import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslationHero } from "./translation-hero";

// The hero embeds the search box, which reads the router. Outside the app there
// is no router mounted, so it is stubbed — the subject here is the hero's own
// markup, not navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

/**
 * The pieces that appear only on the dashboard.
 *
 * Worth isolating because a failure in any of them takes down the one page and
 * leaves every other route working — a pattern that is genuinely confusing to
 * diagnose from the outside, since a health check reports everything reachable.
 */

describe("translation hero", () => {
  it("renders the before-and-after without any data source", () => {
    const html = renderToStaticMarkup(<TranslationHero />);
    // The whole point of the hero is showing a raw filing tag beside the plain
    // sentence it becomes, so both halves have to survive rendering.
    expect(html).toContain("us-gaap");
    expect(html.length).toBeGreaterThan(500);
  });
});

/**
 * Snapshot stability for the localStorage-backed stores.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders whenever
 * one changes. A getter that parses storage afresh on every call therefore
 * returns a new array each time and loops forever — React surfaces that as
 * "maximum update depth exceeded", which unmounts the tree into the error
 * boundary. Both panels live on the dashboard, so this is exactly the shape of
 * bug that would break that page alone.
 */
describe("store snapshot stability", () => {
  let store: Record<string, string>;

  beforeEach(async () => {
    store = {};
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => {
            store[k] = v;
          },
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("returns the identical array when nothing changed", async () => {
    const { getWatchlist, getRecent } = await import("@/lib/watchlist");

    expect(getWatchlist()).toBe(getWatchlist());
    expect(getRecent()).toBe(getRecent());
  });

  it("returns a new array only after the stored value changes", async () => {
    const { getWatchlist, toggleWatch } = await import("@/lib/watchlist");

    const before = getWatchlist();
    toggleWatch("AAPL", "Apple Inc.");
    const after = getWatchlist();

    expect(after).not.toBe(before);
    expect(after.map((e) => e.symbol)).toContain("AAPL");
    // Stable again once settled, or the component re-renders forever.
    expect(getWatchlist()).toBe(after);
  });

  it("survives storage holding something no version of this app wrote", async () => {
    const { getWatchlist, getRecent } = await import("@/lib/watchlist");

    for (const junk of ['{"not":"an array"}', "[1,2,3]", '["AAPL"]', "not json at all", "null"]) {
      store["stockfilter:watchlist"] = junk;
      store["stockfilter:recent"] = junk;

      expect(() => getWatchlist()).not.toThrow();
      expect(() => getRecent()).not.toThrow();
      expect(Array.isArray(getWatchlist())).toBe(true);
    }
  });
});
