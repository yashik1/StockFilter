"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { accountIsEnough } from "@/lib/billing/access-mode";
import { FEATURE_LABELS } from "@/lib/billing/feature-copy";
import { featuresAt, isSellable, type Feature } from "@/lib/billing/tiers";
import { formatPrice, planFor } from "@/lib/billing/plans";

/**
 * The rail that fills the right-hand gutter on a wide screen.
 *
 * A max-width content column leaves a lot of nothing either side of it past
 * about 1700px, and widening the column instead would push running text past
 * the measure it is comfortable to read at. So the column keeps its width and
 * the space beside it earns its keep: what the paid tiers add, for a reader
 * who does not have them.
 *
 * Which features it may name is not decided here. `featuresAt("pro")` reads
 * the same table every gate in the app reads, and the `isSellable` filter is a
 * second belt on the same brace: the price feeds' licence forbids selling
 * anything built on them, and a marketing panel promising one of those is the
 * exact failure `tiers.ts` is written to make impossible. Nothing on this card
 * is hand-listed.
 */

/** Pages where this would be redundant, or would compete with the one task. */
const HIDE_ON = [
  "/pricing",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/account",
];

/** Four is what fits without the card turning into a second pricing page. */
const SHOWN = 4;

function proFeatures(): Feature[] {
  return featuresAt("pro").filter(isSellable).slice(0, SHOWN);
}

export function UpsellRail({ show }: { show: boolean }) {
  const pathname = usePathname();

  if (!show) return null;
  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  /*
    Two modes, one card.

    While `accountIsEnough` is set this deployment charges nobody, so quoting a
    monthly price beside a list of things that are currently free would be a
    straightforward lie. The card says what is true now and turns into the
    real upsell the moment that flag flips — which is the whole reason the
    flag exists rather than the copy being written twice.
  */
  const monthly = planFor("pro", "month");

  return (
    <aside
      aria-labelledby="upsell-heading"
      // Sticks below the header while the page scrolls, so it stays visible
      // without following the viewport like a fixed banner.
      className="sticky top-24"
    >
      <div className="rounded-xl border border-accent/25 bg-gradient-to-b from-accent-soft/70 to-surface p-4 shadow-sm">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <Sparkles aria-hidden className="size-3.5" strokeWidth={2} />
          {accountIsEnough ? "Free while in preview" : "MarketMiner Pro"}
        </p>

        <h2 id="upsell-heading" className="font-display mt-2 text-[1.0625rem] leading-snug">
          {accountIsEnough
            ? "Everything below is free with an account."
            : "Research a whole market at once."}
        </h2>

        <ul className="mt-3 grid list-none gap-1.5">
          {proFeatures().map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-[0.8125rem] text-muted-strong">
              <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2.5} />
              {FEATURE_LABELS[feature]}
            </li>
          ))}
        </ul>

        {!accountIsEnough && (
          <p className="tnum mt-3 text-[0.8125rem] text-muted">
            <span className="font-display text-base font-semibold text-foreground">
              {formatPrice(monthly.price)}
            </span>{" "}
            a month
          </p>
        )}

        <Link
          href={accountIsEnough ? "/signup" : "/pricing"}
          className="font-display mt-3.5 block rounded-lg bg-accent px-4 py-2 text-center text-[0.84375rem] font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent-hover"
        >
          {accountIsEnough ? "Create a free account" : "See the plans"}
        </Link>

        {accountIsEnough && (
          <Link
            href="/pricing"
            className="mt-2 block text-center text-xs text-muted transition-colors hover:text-accent"
          >
            What the tiers will include
          </Link>
        )}
      </div>

      {/*
        Said here as well as on the pricing page. This card is the one place a
        reader meets the paid tiers without having gone looking for them, so it
        is also where the thing they are *not* being asked to pay for belongs —
        charts and backtests are free permanently, and finding that out later
        rather than here would read as a bait.
      */}
      <p className="mt-3 px-1 text-[0.6875rem] leading-relaxed text-faint">
        Charts and backtesting stay free with an account — they are built on data
        licensed for personal use, so they are not ours to sell.
      </p>
    </aside>
  );
}
