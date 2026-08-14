"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Result {
  symbol: string;
  name: string;
  exchange?: string | null;
  country?: string | null;
  /** False for listings outside SEC coverage — findable, but not scoreable. */
  supported?: boolean;
}

/**
 * Symbol search with keyboard navigation.
 *
 * Requests are debounced and each one aborts the previous, so fast typing
 * cannot land an older response after a newer one.
 */
export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      // Cleared asynchronously so the update is not applied synchronously
      // within the effect body.
      const reset = setTimeout(() => {
        setResults([]);
        setProblem(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(reset);
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        // A failed lookup and a genuine "no such company" previously looked
        // identical — both showed an empty box, which leaves nothing to act on.
        setProblem(json.error ? (json.message ?? "Search is unavailable.") : null);
        setResults(json.results ?? []);
        setActive(0);
      } catch {
        // Aborted or offline: leave the previous results in place.
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // Close when focus or a click moves outside the component.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function go(symbol: string) {
    setOpen(false);
    setQuery("");
    router.push(`/stock/${encodeURIComponent(symbol)}`);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = results[active];
      if (pick) go(pick.symbol);
      else if (query.trim()) go(query.trim().toUpperCase());
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search for a company or ticker"
          autoFocus={autoFocus}
          value={query}
          placeholder="Search a company or ticker…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {open && query.trim().length > 0 && (results.length > 0 || loading || problem || !loading) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-[var(--shadow-lg)]"
        >
          {results.length === 0 && loading && (
            <li className="px-3 py-2 text-sm text-muted">Searching…</li>
          )}

          {/* Distinguish an outage from a query that genuinely matches nothing. */}
          {!loading && problem && (
            <li className="px-3 py-2.5 text-sm">
              <span className="font-medium text-poor">Search is unavailable</span>
              <span className="mt-0.5 block text-xs text-muted">{problem}</span>
            </li>
          )}

          {!loading && !problem && results.length === 0 && (
            <li className="px-3 py-2.5 text-sm">
              <span className="font-medium">No company matched</span>
              <span className="mt-0.5 block text-xs text-muted">
                Try the company name instead of the ticker.
              </span>
            </li>
          )}
          {results.map((r, i) => (
            <li key={`${r.symbol}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.symbol)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                  i === active ? "bg-surface-2" : "hover:bg-surface-2",
                )}
              >
                <span className="w-16 shrink-0 font-semibold">{r.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{r.name}</span>
                {/* Naming the exchange up front explains why a foreign listing
                    will not carry scores, before the click rather than after. */}
                {r.exchange && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      r.supported === false
                        ? "bg-surface-3 text-faint"
                        : "bg-surface-2 text-muted",
                    )}
                    title={
                      r.supported === false
                        ? `Listed on ${r.exchange} — outside SEC filings, so no financial scores`
                        : undefined
                    }
                  >
                    {r.exchange}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
