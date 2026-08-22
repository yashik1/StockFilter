"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { Bookmark, BookmarkCheck, Clock, X } from "lucide-react";
import { Card, SectionHeading } from "@/components/ui";
import {
  getRecent,
  getServerSnapshot,
  getWatchlist,
  recordVisit,
  removeFromWatchlist,
  subscribe,
  toggleWatch,
} from "@/lib/watchlist";
import { cn } from "@/lib/utils";

/** Subscribes to the saved list, consistently across server and client render. */
function useWatchlist() {
  return useSyncExternalStore(subscribe, getWatchlist, getServerSnapshot);
}

function useRecent() {
  return useSyncExternalStore(subscribe, getRecent, getServerSnapshot);
}

/**
 * Save toggle for a single company.
 *
 * Renders as unsaved during server render — localStorage does not exist there —
 * and corrects itself on hydration, which is why the label is derived from the
 * subscribed store rather than from a one-off read.
 */
export function WatchButton({
  symbol,
  name,
  className,
}: {
  symbol: string;
  name?: string;
  className?: string;
}) {
  const watchlist = useWatchlist();
  const saved = watchlist.some((e) => e.symbol === symbol.toUpperCase());

  return (
    <button
      type="button"
      onClick={() => toggleWatch(symbol, name)}
      aria-pressed={saved}
      title={saved ? `Remove ${symbol} from your saved list` : `Save ${symbol} to view later`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
        saved
          ? "border-accent bg-accent-soft text-accent"
          : "border-border text-muted-strong hover:border-border-strong hover:text-foreground",
        className,
      )}
    >
      {saved ? (
        <BookmarkCheck aria-hidden className="size-4" />
      ) : (
        <Bookmark aria-hidden className="size-4" />
      )}
      {saved ? "Saved" : "Save"}
    </button>
  );
}

/** Records that this company was opened. Renders nothing. */
export function RecordVisit({ symbol, name }: { symbol: string; name?: string }) {
  useEffect(() => {
    recordVisit(symbol, name);
  }, [symbol, name]);
  return null;
}

/**
 * The saved list and recent history on the dashboard.
 *
 * Both are empty on the server and on a first visit, so the whole block hides
 * itself rather than showing two empty panels to someone who has not used the
 * app yet.
 */
export function WatchlistPanel() {
  const watchlist = useWatchlist();
  const recent = useRecent();

  if (watchlist.length === 0 && recent.length === 0) return null;

  return (
    <section aria-labelledby="saved-heading">
      <SectionHeading
        eyebrow="On this device"
        title={watchlist.length > 0 ? "Your saved companies" : "Recently viewed"}
        description="Kept in this browser only — no account, and it won't follow you to another device."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
        {watchlist.length > 0 && (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <BookmarkCheck aria-hidden className="size-4 text-accent" />
              <h3 id="saved-heading" className="text-sm font-semibold">
                Saved ({watchlist.length})
              </h3>
            </div>
            <ul className="flex flex-wrap gap-2">
              {watchlist.map((entry) => (
                <li key={entry.symbol} className="group relative">
                  <Link
                    href={`/stock/${encodeURIComponent(entry.symbol)}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 py-1.5 pl-3 pr-8 text-sm font-semibold transition-colors hover:border-accent hover:text-accent"
                  >
                    {entry.symbol}
                    {entry.name && (
                      <span className="max-w-[10rem] truncate text-xs font-normal text-muted">
                        {entry.name}
                      </span>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFromWatchlist(entry.symbol)}
                    aria-label={`Remove ${entry.symbol} from saved`}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition-colors hover:bg-surface-3 hover:text-poor"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {recent.length > 0 && (
          <Card className="p-5">
            {/*
              Only titled when the section heading is saying something else.
              With nothing saved the heading above already reads "Recently
              viewed", and repeating it put the same words twice on the page —
              once as an h2 and once as an h3 — which reads as a rendering
              fault to anyone moving through by heading.
            */}
            {watchlist.length > 0 && (
              <div className="mb-3 flex items-center gap-2">
                <Clock aria-hidden className="size-4 text-faint" strokeWidth={1.5} />
                <h3 className="font-display text-base font-semibold">Recently viewed</h3>
              </div>
            )}
            <ul className="flex flex-wrap gap-2">
              {recent.map((entry) => (
                <li key={entry.symbol}>
                  <Link
                    href={`/stock/${encodeURIComponent(entry.symbol)}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
                  >
                    {entry.symbol}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </section>
  );
}
