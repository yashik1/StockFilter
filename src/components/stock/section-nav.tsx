"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Jump links along the top of a stock page.
 *
 * These pages run to a dozen panels and several screens of scrolling, and a
 * reader who arrived by searching a ticker almost always wants one particular
 * thing — the dividend, the filings, the price — rather than a read from the
 * top. Until now the only way to reach any of them was to scroll past
 * everything else.
 *
 * Plain anchors rather than scroll handlers, so the links work before
 * JavaScript loads, keyboard and middle-click behave the way a link should,
 * and each section gets a shareable URL. The only thing script adds is
 * highlighting whichever section you are currently looking at, and keeping
 * that chip visible in the strip on a narrow screen.
 */

export interface StockSection {
  /** Element id on the page, and the URL fragment. */
  id: string;
  /** Short enough to read in a horizontal strip at a glance. */
  label: string;
}

/**
 * Height of the sticky chrome above a section: the site header plus this bar.
 *
 * Anchor targets carry a matching `scroll-mt` so a jumped-to heading lands
 * below the bars rather than underneath them. Kept here as a named constant
 * because the two numbers have to agree and nothing else would say why.
 */
const SCROLL_MARGIN = "scroll-mt-28";

/**
 * Height of the site header plus this bar, in pixels.
 *
 * The line a section's heading has to cross before it counts as the one being
 * read. Measured rather than guessed would be better, but the two bars are
 * fixed-height by design and a stale constant here only shifts the highlight
 * by a few pixels of scroll — it cannot put the wrong section in the bar.
 */
const CHROME_HEIGHT = 96;

/**
 * Which section a reader is currently looking at.
 *
 * Pulled out of the component as a plain function over measurements, because
 * the browser preview used to build this could neither dispatch scroll events
 * nor run an IntersectionObserver — so the rule was untestable while it lived
 * inside an effect. As a function it can be checked directly.
 *
 * The rule itself is the one every table of contents uses: the current section
 * is the last one whose top has passed under the sticky bars. That keeps a
 * section marked for as long as you are inside it, rather than only while its
 * heading happens to be on screen.
 */
export function currentSection(
  tops: { id: string; top: number }[],
  atBottom = false,
): string | null {
  if (tops.length === 0) return null;

  /*
    The bottom of the page is a special case rather than a refinement. The
    last section is usually too short to push its own top above the line, so
    without this it can never become current — you scroll to the end of the
    page and the bar still points at the section before it, with no scroll
    left to fix it.
  */
  if (atBottom) return tops[tops.length - 1].id;

  let current = tops[0].id;
  for (const { id, top } of tops) {
    if (top <= CHROME_HEIGHT) current = id;
  }
  return current;
}

export function SectionNav({ sections }: { sections: StockSection[] }) {
  /*
    Pruned on the client rather than trusted from the server.

    The page works out which panels it is rendering and passes only those, but
    several of them hide themselves on conditions the page cannot see from
    outside. A link to a section that is not on the page is worse than a
    missing link — it does nothing at all when clicked, and the reader has no
    way to tell that from a broken page.
  */
  const [present, setPresent] = useState<StockSection[]>(sections);
  const [active, setActive] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /*
      Measured on the next frame rather than during the commit. Two reasons,
      and both matter: setting state synchronously inside an effect cascades a
      second render before the browser has painted the first, and offsetHeight
      read in that same tick can catch a panel before its layout has settled —
      which would prune a section that is in fact perfectly visible.
    */
    const frame = requestAnimationFrame(() => {
      // offsetHeight is zero for a section whose panel hid itself, so this
      // drops both the missing and the collapsed in one test.
      setPresent(
        sections.filter((s) => {
          const el = document.getElementById(s.id);
          return el !== null && el.offsetHeight > 0;
        }),
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [sections]);

  useEffect(() => {
    const targets = present
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    if (targets.length === 0) return;

    /*
      A scroll listener rather than an IntersectionObserver.

      An observer is the tidier tool and was the first implementation, but its
      callbacks only run in a frame the browser is actually compositing, which
      made the highlight impossible to test here — a plain observer with no
      margins fired nothing at all. Measuring positions on scroll gives the
      same answer, is deterministic, and can be verified by scrolling the page
      and reading the result.

      The rule is the one every table of contents uses: the current section is
      the last one whose top has passed under the sticky bars. That keeps a
      section highlighted for as long as you are inside it, rather than only
      while its heading happens to be on screen.
    */
    let frame = 0;

    const update = () => {
      frame = 0;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      setActive(
        currentSection(
          targets.map((el) => ({ id: el.id, top: el.getBoundingClientRect().top })),
          atBottom,
        ),
      );
    };

    const onScroll = () => {
      // Coalesced to one measurement per frame: scroll fires far faster than
      // the page can repaint, and each pass reads layout for every section.
      if (!frame) frame = requestAnimationFrame(update);
    };

    // Deferred for the same reason as the prune above: the first measurement
    // belongs after paint, not inside the commit that scheduled it.
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [present]);

  /*
    Keep the current chip in view on a narrow screen, where the strip scrolls
    sideways and the active one is often off the edge. Scrolls the strip
    itself rather than calling scrollIntoView, which would also move the page
    and fight the reader.
  */
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !active) return;

    const chip = strip.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!chip) return;

    const left = chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2;
    strip.scrollTo({
      left: Math.max(0, left),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [active]);

  // One link is not a navigation aid, it is a stray button.
  if (present.length < 2) return null;

  return (
    <nav
      aria-label="Sections of this page"
      // Below the site header's z-30 so it tucks under rather than over it.
      className="sticky top-14 z-20 -mx-7 border-b border-border bg-[color-mix(in_srgb,var(--background)_92%,transparent)] backdrop-blur-[8px]"
    >
      <div
        ref={stripRef}
        // Scrolls sideways on a narrow screen instead of widening the page.
        // The scrollbar is hidden because the chips themselves make it obvious
        // there is more, and a horizontal bar here would sit under the text.
        className="flex gap-1 overflow-x-auto px-7 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {present.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            data-section={s.id}
            // "location" rather than "page": these point within the current
            // page, not at a different one.
            aria-current={active === s.id ? "location" : undefined}
            className={cn(
              "shrink-0 border border-transparent px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
              "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active === s.id
                ? "border-border bg-surface-2 font-medium text-foreground"
                : "text-muted",
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/**
 * Wraps a panel so it can be linked to, and vanishes when the panel does.
 *
 * `className` is for the few sections holding more than one panel: those lose
 * the page's own vertical rhythm by being wrapped, and have to restate it.
 */
export function Section({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  /*
    `empty:hidden` is doing real work here. Several panels decide for
    themselves that they have nothing to say and render nothing at all — an
    anchor wrapper around one of those would be an empty box that still
    collects a gap from the page's `space-y`, leaving a visible hole where a
    section used to be. Hiding an empty wrapper removes it from the flow
    entirely, so the spacing closes up as if it were never there.
  */
  return (
    <div id={id} className={cn(SCROLL_MARGIN, "empty:hidden", className)}>
      {children}
    </div>
  );
}
