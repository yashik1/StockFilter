import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The watchlist reads and writes localStorage and feeds `useSyncExternalStore`,
 * which has two sharp edges these tests pin down:
 *
 *  - `getSnapshot` must return a referentially stable value between calls, or
 *    React re-renders forever.
 *  - Storage can be unavailable or hold junk (private browsing, a half-written
 *    value, another script on the origin), and none of that may throw during
 *    render.
 */

class FakeStorage {
  private data = new Map<string, string>();
  /** Set to simulate private browsing, where access throws. */
  blocked = false;
  /** Set to simulate an exhausted quota on write only. */
  quotaFull = false;

  getItem(key: string): string | null {
    if (this.blocked) throw new DOMException("blocked", "SecurityError");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.blocked || this.quotaFull) throw new DOMException("full", "QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  /** Writes a raw value, bypassing the guards, to simulate corruption. */
  seed(key: string, value: string): void {
    this.data.set(key, value);
  }
}

let storage: FakeStorage;
let mod: typeof import("./watchlist");

beforeEach(async () => {
  storage = new FakeStorage();
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  });
  vi.stubGlobal("Event", class {
    constructor(public type: string) {}
  });
  // Re-imported per test so the module-level snapshot cache starts clean.
  vi.resetModules();
  mod = await import("./watchlist");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchlist", () => {
  it("starts empty", () => {
    expect(mod.getWatchlist()).toEqual([]);
    expect(mod.isWatched("AAPL")).toBe(false);
  });

  it("adds and removes a symbol", () => {
    expect(mod.toggleWatch("AAPL", "Apple Inc.")).toBe(true);
    expect(mod.isWatched("AAPL")).toBe(true);
    expect(mod.getWatchlist()[0]).toMatchObject({ symbol: "AAPL", name: "Apple Inc." });

    expect(mod.toggleWatch("AAPL")).toBe(false);
    expect(mod.isWatched("AAPL")).toBe(false);
    expect(mod.getWatchlist()).toEqual([]);
  });

  it("treats symbols case-insensitively", () => {
    mod.toggleWatch("aapl");
    expect(mod.isWatched("AAPL")).toBe(true);
    expect(mod.isWatched("aApL")).toBe(true);
    expect(mod.getWatchlist()[0].symbol).toBe("AAPL");
  });

  it("puts the newest addition first", () => {
    mod.toggleWatch("AAPL");
    mod.toggleWatch("MSFT");
    expect(mod.getWatchlist().map((e) => e.symbol)).toEqual(["MSFT", "AAPL"]);
  });

  it("does not add a duplicate", () => {
    mod.toggleWatch("AAPL");
    mod.toggleWatch("AAPL"); // removes
    mod.toggleWatch("AAPL"); // adds again
    expect(mod.getWatchlist()).toHaveLength(1);
  });

  it("removes a specific symbol directly", () => {
    mod.toggleWatch("AAPL");
    mod.toggleWatch("MSFT");
    mod.removeFromWatchlist("AAPL");
    expect(mod.getWatchlist().map((e) => e.symbol)).toEqual(["MSFT"]);
  });

  it("persists across a fresh module load", async () => {
    mod.toggleWatch("AAPL", "Apple Inc.");
    vi.resetModules();
    const reloaded = await import("./watchlist");
    expect(reloaded.getWatchlist().map((e) => e.symbol)).toEqual(["AAPL"]);
  });
});

// React compares snapshots by identity; a new array each call loops forever.
describe("snapshot stability", () => {
  it("returns the same array reference when nothing changed", () => {
    mod.toggleWatch("AAPL");
    expect(mod.getWatchlist()).toBe(mod.getWatchlist());
  });

  it("returns a new reference only after a change", () => {
    const before = mod.getWatchlist();
    mod.toggleWatch("AAPL");
    const after = mod.getWatchlist();
    expect(after).not.toBe(before);
    expect(after).toBe(mod.getWatchlist());
  });

  it("keeps the server snapshot stable", () => {
    expect(mod.getServerSnapshot()).toBe(mod.getServerSnapshot());
    expect(mod.getServerSnapshot()).toEqual([]);
  });
});

describe("hostile storage", () => {
  it("survives corrupt JSON", () => {
    storage.seed("stockfilter:watchlist", "{not json");
    expect(() => mod.getWatchlist()).not.toThrow();
    expect(mod.getWatchlist()).toEqual([]);
  });

  it("survives a JSON value that is not an array", () => {
    storage.seed("stockfilter:watchlist", '{"symbol":"AAPL"}');
    expect(mod.getWatchlist()).toEqual([]);
  });

  it("drops entries with no symbol rather than rendering blanks", () => {
    storage.seed(
      "stockfilter:watchlist",
      JSON.stringify([{ symbol: "AAPL" }, { name: "no symbol" }, { symbol: "" }]),
    );
    expect(mod.getWatchlist().map((e) => e.symbol)).toEqual(["AAPL"]);
  });

  it("does not throw when storage is blocked", () => {
    storage.blocked = true;
    expect(() => mod.getWatchlist()).not.toThrow();
    expect(() => mod.toggleWatch("AAPL")).not.toThrow();
    expect(mod.getWatchlist()).toEqual([]);
  });

  it("does not throw when the quota is exhausted", () => {
    storage.quotaFull = true;
    expect(() => mod.toggleWatch("AAPL")).not.toThrow();
  });
});

describe("recently viewed", () => {
  it("records a visit", () => {
    mod.recordVisit("AAPL", "Apple Inc.");
    expect(mod.getRecent().map((e) => e.symbol)).toEqual(["AAPL"]);
  });

  it("moves a repeat visit back to the front instead of duplicating", () => {
    mod.recordVisit("AAPL");
    mod.recordVisit("MSFT");
    mod.recordVisit("AAPL");
    expect(mod.getRecent().map((e) => e.symbol)).toEqual(["AAPL", "MSFT"]);
  });

  it("caps the history so it cannot grow without bound", () => {
    for (let i = 0; i < 20; i++) mod.recordVisit(`SYM${i}`);
    expect(mod.getRecent()).toHaveLength(8);
    expect(mod.getRecent()[0].symbol).toBe("SYM19");
  });

  it("clears", () => {
    mod.recordVisit("AAPL");
    mod.clearRecent();
    expect(mod.getRecent()).toEqual([]);
  });

  it("is independent of the watchlist", () => {
    mod.recordVisit("AAPL");
    expect(mod.getWatchlist()).toEqual([]);
    mod.toggleWatch("MSFT");
    expect(mod.getRecent().map((e) => e.symbol)).toEqual(["AAPL"]);
  });
});
