"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
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
import {
  mergeLocalWatchlist,
  removeFromWatchlist as removeSaved,
  saveToWatchlist,
} from "@/lib/watchlist/actions";
import { cn } from "@/lib/utils";

/** Subscribes to the browser-held list, consistently across server and client render. */
function useLocalWatchlist() {
  return useSyncExternalStore(subscribe, getWatchlist, getServerSnapshot);
}

function useRecent() {
  return useSyncExternalStore(subscribe, getRecent, getServerSnapshot);
}

/**
 * Save toggle for a single company.
 *
 * Two backing stores, chosen by whether anybody is signed in. The account is
 * authoritative when there is one — that is the whole point, since a list
 * that lives in one browser is not a list you can rely on — and localStorage
 * remains the signed-out path so somebody can start saving companies before
 * deciding whether to register.
 *
 * The signed-out branch renders as unsaved during server render, because
 * localStorage does not exist there, and corrects itself on hydration. That
 * is why its label is derived from the subscribed store rather than from a
 * one-off read.
 */
export function WatchButton({
  symbol,
  name,
  signedIn = false,
  initialSaved = false,
  className,
}: {
  symbol: string;
  name?: string;
  signedIn?: boolean;
  /** Whether the account already holds this company. Server-rendered. */
  initialSaved?: boolean;
  className?: string;
}) {
  const local = useLocalWatchlist();
  const upper = symbol.toUpperCase();

  // Held locally and updated straight away rather than waiting for the round
  // trip: a save button that pauses before acknowledging feels broken, and
  // the failure path below puts it back if the write did not land.
  const [savedOnAccount, setSavedOnAccount] = useState(initialSaved);
  const [renderedFor, setRenderedFor] = useState(upper);
  const [pending, startTransition] = useTransition();

  /*
    Reset when a different company renders through this same button.

    React reconciles the button at the same position on a client navigation
    from one company page to another, so without this the optimistic state
    from the previous company carries over and the new page opens claiming to
    be saved. Adjusted during render rather than in an effect: React discards
    the in-progress output and re-renders immediately, so nothing incorrect
    ever reaches the screen — where an effect would paint the stale state
    first and then correct it.
  */
  if (renderedFor !== upper) {
    setRenderedFor(upper);
    setSavedOnAccount(initialSaved);
  }

  const saved = signedIn ? savedOnAccount : local.some((e) => e.symbol === upper);

  function onClick() {
    if (!signedIn) {
      toggleWatch(symbol, name);
      return;
    }

    const next = !savedOnAccount;
    setSavedOnAccount(next);
    startTransition(async () => {
      const result = next ? await saveToWatchlist(upper, name) : await removeSaved(upper);
      // Roll back rather than leaving the button asserting something untrue.
      if (!result.ok) setSavedOnAccount(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      title={
        saved
          ? `Remove ${symbol} from your saved list`
          : signedIn
            ? `Save ${symbol} to your account`
            : `Save ${symbol} to view later in this browser`
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
        saved
          ? "border-accent bg-accent-soft text-accent"
          : "border-border text-muted-strong hover:border-border-strong hover:text-foreground",
        pending && "opacity-70",
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
 * Folds a browser-held list into the account, once, after signing in.
 *
 * Renders nothing. Clears the local copy only after the merge is confirmed —
 * clearing first would lose the list outright if the write failed, which is
 * the one outcome this whole feature exists to prevent.
 */
export function WatchlistSync({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn) return;

    const pending = getWatchlist();
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const result = await mergeLocalWatchlist(
        pending.map((e) => ({ symbol: e.symbol, name: e.name })),
      );
      if (cancelled || !result.ok) return;
      for (const entry of pending) removeFromWatchlist(entry.symbol);
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return null;
}

/**
 * The saved list and recent history on the dashboard.
 *
 * The saved half comes from the account when there is one and from the
 * browser otherwise; recently-viewed stays local either way, because it is a
 * convenience for this device rather than a list anybody curated.
 *
 * Both are empty on a first visit, so the whole block hides itself rather
 * than showing two empty panels to somebody who has not used the app yet.
 */
export function WatchlistPanel({
  signedIn = false,
  saved: serverSaved = [],
}: {
  signedIn?: boolean;
  /** The account's saved companies. Server-rendered. */
  saved?: { symbol: string; name?: string | null }[];
}) {
  const local = useLocalWatchlist();
  const recent = useRecent();

  const watchlist = signedIn ? serverSaved : local;

  if (watchlist.length === 0 && recent.length === 0) return null;

  return (
    <section aria-labelledby="saved-heading">
      <SectionHeading
        eyebrow={signedIn ? "On your account" : "On this device"}
        title={watchlist.length > 0 ? "Your saved companies" : "Recently viewed"}
        description={
          signedIn
            ? "Saved to your account, so this list follows you to any browser you sign in from."
            : "Kept in this browser only. Sign in and it will follow you to your other devices."
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
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
                  <RemoveButton symbol={entry.symbol} signedIn={signedIn} />
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

function RemoveButton({ symbol, signedIn }: { symbol: string; signedIn: boolean }) {
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);

  function onClick() {
    if (!signedIn) {
      removeFromWatchlist(symbol);
      return;
    }
    setGone(true);
    startTransition(async () => {
      const result = await removeSaved(symbol);
      if (!result.ok) setGone(false);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || gone}
      aria-label={`Remove ${symbol} from saved`}
      className={cn(
        "absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition-colors hover:bg-surface-3 hover:text-poor",
        (pending || gone) && "opacity-40",
      )}
    >
      <X aria-hidden className="size-3" />
    </button>
  );
}
