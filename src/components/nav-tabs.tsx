"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  SlidersHorizontal,
  GitCompare,
  CandlestickChart,
  History,
  NotebookPen,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

/** "/" would otherwise prefix-match every route in the app. */
function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/*
  Keyed by href rather than threaded through NavItem: the NAV array lives in
  the server-rendered layout.tsx, and a React component reference cannot
  cross the server/client boundary as a prop the way a plain string can. Both
  renderings below live in this one client file, so one map covers both.
*/
const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/screen": SlidersHorizontal,
  "/compare": GitCompare,
  "/markets": CandlestickChart,
  "/backtest": History,
  "/journal": NotebookPen,
  "/learn": GraduationCap,
};

/**
 * The header's primary navigation.
 *
 * Two renderings of the same seven links, swapped by breakpoint rather than
 * degrading one into the other. Below `lg` this used to stay a flex-wrap row
 * and simply wrap onto a second and third line — which never overflowed, but
 * read as clutter stacked directly above a search box that was already
 * fighting for room. A hamburger trades that stack for one 34px button, the
 * same size as the theme toggle beside it.
 *
 * A client component only because the active tab has to know the current
 * route. Everything else about the header stays on the server.
 *
 * The active tab is marked by a 2px accent rule under it *and* by full-ink
 * text against the 62% ink of the rest — two signals rather than one, so the
 * current page is still findable if the accent is hard to distinguish. The
 * rule is drawn with a transparent border on every tab rather than added to
 * the active one, so switching tabs never changes a row's height.
 */
export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden min-w-0 flex-wrap items-center gap-x-[18px] gap-y-2 lg:flex">
      {items.map((item) => {
        const active = isActive(item.href, pathname);
        const Icon = NAV_ICONS[item.href];

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "font-display flex items-center gap-1.5 border-b-2 px-0.5 py-2 text-[0.90625rem] leading-none font-semibold transition-colors",
              active
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {Icon && <Icon aria-hidden className="size-4" strokeWidth={2} />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The same navigation, as a hamburger — shown only below `lg`, the mirror
 * image of NavTabs above.
 *
 * The panel is a dropdown rather than a full-screen drawer: this app never
 * reaches for an overlay elsewhere, and seven links do not need one. Closing
 * behaviour follows the exact pattern SearchBox already uses for its own
 * dropdown — an outside-click listener and nothing fancier — so the two
 * popovers in this header behave identically rather than each inventing
 * their own rules.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [renderedFor, setRenderedFor] = useState(pathname);
  const containerRef = useRef<HTMLDivElement>(null);

  /*
    Closes on navigation — a link click, or the back/forward buttons — so the
    panel never stays open over the page it was just used to leave.

    Adjusted during render rather than in an effect, for the same reason the
    watch button on a stock page does the same thing: React discards the
    in-progress output and re-renders immediately on a state change made
    during render, so the panel is never painted open-over-new-page even for
    one frame — which a `useEffect` here would do, since an effect runs after
    the browser has already shown that frame.
  */
  if (renderedFor !== pathname) {
    setRenderedFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    /*
      No `relative` here. The panel below is positioned absolutely against
      `header` instead — sticky positioning establishes a containing block
      exactly like relative does, and header is where the width should come
      from. Anchored to this wrapper instead, the panel inherited the
      wrapper's own content-sized box: 34px wide, sitting wherever the
      hamburger happened to land next to the logo. At 320px that put a 224px
      panel starting 156px in, 60px past the right edge of the viewport.
      Spanning the header itself, the panel's width is however much room the
      header has, at every width, by construction.
    */
    <div ref={containerRef} className="flex lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-transparent text-muted-strong transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
      </button>

      {open && (
        <ul
          id="mobile-nav-panel"
          className="absolute inset-x-7 top-full z-50 mt-2 rounded-xl border border-border bg-surface py-1 shadow-[var(--shadow-lg)]"
        >
          {items.map((item) => {
            const active = isActive(item.href, pathname);
            const Icon = NAV_ICONS[item.href];

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  // Closes immediately on tap, rather than only once the
                  // route changes. Tapping the link for the page already
                  // open — a real case, since Dashboard leads the list and a
                  // reader can easily land here already on it — changes no
                  // pathname for the render-time check above to react to,
                  // and would otherwise leave the panel open over the page
                  // it was just used to confirm.
                  onClick={() => setOpen(false)}
                  className={cn(
                    "font-display flex items-center gap-2.5 border-l-2 px-4 py-3.5 text-[0.90625rem] font-semibold transition-colors",
                    active
                      ? "border-accent bg-surface-2 text-foreground"
                      : "border-transparent text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {Icon && <Icon aria-hidden className="size-4" strokeWidth={2} />}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
