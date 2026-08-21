"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The header's primary navigation.
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
export function NavTabs({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-x-[18px] gap-y-2 justify-self-start">
      {items.map((item) => {
        // "/" would otherwise prefix-match every route in the app.
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "font-display border-b-2 px-0.5 py-2 text-[0.90625rem] leading-none font-semibold transition-colors",
              active
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
