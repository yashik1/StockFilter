import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FEATURE_LABELS } from "@/lib/billing/feature-copy";
import { FEATURES, type Feature } from "@/lib/billing/tiers";

/**
 * The wide-screen upsell rail.
 *
 * Almost everything here is about one rule: this card may never advertise a
 * feature built on the licensed price feeds. The pricing page has a runtime
 * guard for the same thing, and this is the equivalent for the other surface
 * that names paid features — the two together are why `tiers.ts` can claim the
 * constraint is structural rather than remembered.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { UpsellRail } = await import("./upsell-rail");

const render = (show: boolean) => renderToStaticMarkup(<UpsellRail show={show} />);

describe("what it is allowed to advertise", () => {
  /*
    The one that matters. Backtesting and the chart overlays are the most
    attractive things in the app and cannot be sold at any price — the free
    tiers they are built on licence personal, non-commercial use only.
  */
  it("never names a feature built on personal-use-only data", () => {
    const html = render(true);

    const blocked = (Object.keys(FEATURES) as Feature[]).filter(
      (f) => FEATURES[f].kind === "personal-use-data",
    );

    // There is something to be wrong about — if this list ever empties, the
    // assertion below would pass by vacancy rather than by being true.
    expect(blocked.length).toBeGreaterThan(0);

    for (const feature of blocked) {
      expect(html).not.toContain(FEATURE_LABELS[feature]);
    }
  });

  it("says outright that charts and backtesting are not being sold", () => {
    // The reader meets the paid tiers here without having gone looking for
    // them, so this is where the exclusion belongs — not only on /pricing.
    expect(render(true)).toContain("free with an account");
  });

  it("names features that are actually sellable", () => {
    const html = render(true);
    // Sanity: the card is not empty of the thing it exists to show.
    expect(html).toContain(FEATURE_LABELS.ADVANCED_SCREENER);
  });
});

describe("when it appears at all", () => {
  it("renders nothing for a visitor with nothing to be offered", () => {
    expect(render(false)).toBe("");
  });

  it("renders something for a visitor who does not have the paid features", () => {
    expect(render(true)).not.toBe("");
  });
});

describe("the labels it draws from", () => {
  /*
    FEATURE_LABELS is a total Record, so a missing key is a compile error
    rather than a test failure — but an empty string satisfies the type and
    would render a bullet with no text.
  */
  it("has a non-empty label for every feature", () => {
    for (const feature of Object.keys(FEATURES) as Feature[]) {
      expect(FEATURE_LABELS[feature].trim().length).toBeGreaterThan(0);
    }
  });
});
