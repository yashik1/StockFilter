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
 * Fallback offset for a browser that has not yet measured the header — the
 * very first frame, and the only value used when JavaScript never runs. Sized
 * for the header's ordinary single-row height. See `globals.css`, which
 * declares the same number as the page-wide `scroll-padding-top` default.
 */
const FALLBACK_OFFSET = 112;

/**
 * Slack added past the sticky bars' real bottom edge, shared by the landing
 * spot and the activation line so they cannot disagree the way they did the
 * first time this file measured that edge instead of guessing it.
 *
 * Landing needs it so a jumped-to heading sits comfortably clear of the bars
 * rather than flush against them, and so a sub-pixel measurement — the header
 * height above came back `100.8px` on the phone this was tested against — can
 * never place a heading a fraction of a pixel above where it needs to be.
 *
 * The activation line needs the SAME slack, not its own: a section is meant
 * to light up the moment a reader lands on it, and `scroll-padding-top`
 * parks a landed section exactly this far past the bars' edge. Reading the
 * bars' bare edge for the line and their edge-plus-slack for the landing spot
 * put those two numbers 4px apart, so a section a reader had just clicked
 * straight to sat 4px on the wrong side of its own activation line — the
 * previous chip stayed lit. One constant, spent in both places, is what
 * keeps that from happening again.
 */
const CHROME_SLACK = 4;

/**
 * Which section a reader is currently looking at.
 *
 * Pulled out of the component as a plain function over measurements, because
 * the browser preview used to build this could neither dispatch scroll events
 * nor run an IntersectionObserver — so the rule was untestable while it lived
 * inside an effect. As a function it can be checked directly.
 *
 * `line` is the caller's current answer to "where does the sticky chrome
 * end", measured live rather than assumed. A fixed pixel constant sat here
 * once, sized for the site header's ordinary single-row height — and was
 * wrong on a phone, where the header's third column force-wraps onto a second
 * row and the header ends up noticeably taller. That mismatch is what let the
 * section strip lock itself partly behind the header instead of below it,
 * which looked like the whole bar shrinking away as you scrolled: this file's
 * fix is to stop assuming the chrome's height and start measuring it.
 *
 * The rule itself is the one every table of contents uses: the current
 * section is the last one whose top has passed under the sticky bars. That
 * keeps a section marked for as long as you are inside it, rather than only
 * while its heading happens to be on screen.
 */
export function currentSection(
  tops: { id: string; top: number }[],
  line: number,
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
    if (top <= line) current = id;
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
  const navRef = useRef<HTMLElement>(null);

  /*
    Sits directly below the real site header, whatever height that turns out
    to be, rather than under a guess of one.

    The header is not a fixed height: its right-hand column force-wraps onto a
    second row once the viewport is too narrow to hold it beside the nav
    links, which is exactly the range this strip has to work on a phone. A
    Tailwind class picks one number at build time; measuring the header
    element itself is correct at every width, and stays correct if the header
    changes in ways this file never has to know about.

    A ResizeObserver rather than a `resize` listener, because the header's
    height can change for reasons that never fire `resize` at all — a web font
    swapping in, a breakpoint crossed by content reflow rather than by the
    window changing size.
  */
  useEffect(() => {
    const header = document.getElementById("site-header");
    const nav = navRef.current;
    if (!header || !nav) return;

    const apply = () => {
      const headerHeight = header.getBoundingClientRect().height;
      nav.style.top = `${headerHeight}px`;

      /*
        Same measurement, spent on the other half of this problem: how far a
        fragment jump should land below the top of the window. One property
        on the document, rather than a class repeated on every anchor target —
        the previous version needed three copies of that class to agree with
        each other and with this component's own numbers, and had already
        drifted out of sync once. There is nothing left here that can drift.
      */
      const navHeight = nav.getBoundingClientRect().height;
      document.documentElement.style.scrollPaddingTop = `${headerHeight + navHeight + CHROME_SLACK}px`;
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    observer.observe(nav);

    return () => {
      observer.disconnect();
      // However this strip goes away — the panel it belongs to emptying out,
      // or navigating to a page that never mounts one — the next page must
      // not inherit a scroll offset sized for this one's two sticky bars.
      document.documentElement.style.scrollPaddingTop = "";
    };
    // Re-runs whenever the rendered set of sections changes, which is exactly
    // when `<nav>` itself might have mounted or unmounted — `present` shrinking
    // below two hides it entirely, and this has to notice.
  }, [present]);

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

      /*
        The line is wherever this bar's own bottom edge actually is right now,
        not a number decided in advance. That is what makes this correct on a
        header of any height without this file needing to know what that
        height is — the earlier version guessed 112px, and a guess is exactly
        what put a phone's taller header in the way in the first place.

        Plus CHROME_SLACK, matching where a jump actually lands a section —
        see that constant for why the two have to use the same number.
      */
      const line =
        (navRef.current?.getBoundingClientRect().bottom ?? FALLBACK_OFFSET) + CHROME_SLACK;

      setActive(
        currentSection(
          targets.map((el) => ({ id: el.id, top: el.getBoundingClientRect().top })),
          line,
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
      ref={navRef}
      aria-label="Sections of this page"
      // top-14 is the pre-measurement fallback for the first frame and for a
      // browser with JavaScript off — a guess at the header's ordinary
      // single-row height. The effect above overwrites it by inline style the
      // instant it can measure the header for real, which on a phone is a
      // taller number: that header wraps onto two rows there, and this bar
      // has to sit below both of them, not below where a one-row header would
      // have ended.
      //
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
 *
 * No `scroll-mt` here. Where space above a jumped-to heading has to be
 * reserved for the sticky bars, `scroll-padding-top` on the document does that
 * once, globally — see the rule in `globals.css` and the effect above that
 * keeps it matched to the header's real, measured height. A per-section class
 * doing the same job would be a second number that has to agree with the
 * first.
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
    <div id={id} className={cn("empty:hidden", className)}>
      {children}
    </div>
  );
}
