/**
 * Watchlist and recently-viewed, stored in the browser.
 *
 * This module is now the **signed-out** path only. The saved list moved onto
 * the account in src/lib/watchlist/actions.ts — a list that lives in one
 * browser is not one anybody can rely on, and the app had been asking people
 * to register while still forgetting their companies the moment they picked
 * up a phone.
 *
 * What is kept here, and why:
 *
 *  - **The saved list, before sign-in.** Somebody should be able to start
 *    using the app without registering first, so saving works immediately and
 *    is merged onto the account on their first sign-in rather than discarded.
 *  - **Recently viewed, always.** That is a convenience for this device
 *    rather than a list anybody curated, and syncing it would mean quietly
 *    recording browsing history against an account.
 *
 * Reads go through `useSyncExternalStore` in the components, so the value is
 * consistent between server render and hydration and updates propagate across
 * tabs without a refresh.
 */

const WATCHLIST_KEY = "stockfilter:watchlist";
const RECENT_KEY = "stockfilter:recent";
const MAX_RECENT = 8;

export interface SavedSymbol {
  symbol: string;
  name?: string;
  addedAt: number;
}

/** Fired locally on change — the native `storage` event only fires cross-tab. */
const CHANGE_EVENT = "stockfilter:store-change";

type Listener = () => void;

function read(key: string): SavedSymbol[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SavedSymbol => typeof e?.symbol === "string" && e.symbol.length > 0,
    );
  } catch {
    // Corrupt JSON, or storage blocked in private browsing. An empty list is a
    // better outcome than a thrown error on every render.
    return [];
  }
}

function write(key: string, value: SavedSymbol[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Quota exceeded or storage disabled — the in-memory UI still works for
    // this session, it just will not persist.
  }
}

export function subscribe(listener: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

// ---------------------------------------------------------------- watchlist

/**
 * Cached snapshots.
 *
 * useSyncExternalStore compares snapshots by identity and re-renders whenever
 * one changes, so returning a freshly parsed array each call would loop
 * forever. The cache is only replaced when the serialised value differs.
 */
let watchlistCache: SavedSymbol[] = [];
let watchlistRaw: string | null = null;

export function getWatchlist(): SavedSymbol[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = (() => {
    try {
      return window.localStorage.getItem(WATCHLIST_KEY);
    } catch {
      return null;
    }
  })();

  if (raw !== watchlistRaw) {
    watchlistRaw = raw;
    watchlistCache = read(WATCHLIST_KEY);
  }
  return watchlistCache;
}

export function isWatched(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return getWatchlist().some((e) => e.symbol === upper);
}

export function toggleWatch(symbol: string, name?: string): boolean {
  const upper = symbol.toUpperCase();
  const current = read(WATCHLIST_KEY);
  const existing = current.find((e) => e.symbol === upper);

  if (existing) {
    write(WATCHLIST_KEY, current.filter((e) => e.symbol !== upper));
    return false;
  }

  // Newest first, so the most recent addition is visible without scrolling.
  write(WATCHLIST_KEY, [{ symbol: upper, name, addedAt: Date.now() }, ...current]);
  return true;
}

export function removeFromWatchlist(symbol: string): void {
  const upper = symbol.toUpperCase();
  write(WATCHLIST_KEY, read(WATCHLIST_KEY).filter((e) => e.symbol !== upper));
}

// ----------------------------------------------------------- recently viewed

let recentCache: SavedSymbol[] = [];
let recentRaw: string | null = null;

export function getRecent(): SavedSymbol[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = (() => {
    try {
      return window.localStorage.getItem(RECENT_KEY);
    } catch {
      return null;
    }
  })();

  if (raw !== recentRaw) {
    recentRaw = raw;
    recentCache = read(RECENT_KEY);
  }
  return recentCache;
}

/** Records a visit, moving an existing entry back to the front. */
export function recordVisit(symbol: string, name?: string): void {
  const upper = symbol.toUpperCase();
  const current = read(RECENT_KEY).filter((e) => e.symbol !== upper);
  write(RECENT_KEY, [{ symbol: upper, name, addedAt: Date.now() }, ...current].slice(0, MAX_RECENT));
}

export function clearRecent(): void {
  write(RECENT_KEY, []);
}

/**
 * A single frozen empty array shared by every server render.
 *
 * useSyncExternalStore requires the server snapshot to be referentially stable;
 * returning a new `[]` each call throws an infinite-loop warning.
 */
const EMPTY: SavedSymbol[] = [];

export function getServerSnapshot(): SavedSymbol[] {
  return EMPTY;
}
