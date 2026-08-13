"use client";

import { useState } from "react";
import { CompareChart } from "@/components/compare-chart";
import { PriceChart } from "@/components/price-chart";
import { cn } from "@/lib/utils";

/**
 * The stock page's price panel, switchable between this company alone and its
 * performance against industry peers.
 *
 * These are two genuinely different views rather than one chart with a toggle.
 * A single company is read as a price — candles, volume, intraday detail. A
 * comparison is read as relative performance, so it rebases every line to zero
 * and drops volume, because plotting several companies' absolute prices on one
 * axis implies a relationship the numbers do not have.
 */
export function PricePanel({ symbol, peers }: { symbol: string; peers: string[] }) {
  const [mode, setMode] = useState<"single" | "peers">("single");

  // Four lines is where a comparison stays readable, and it matches the
  // validated categorical palette, which has four slots.
  const peerSymbols = peers.slice(0, 3);
  const canCompare = peerSymbols.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {canCompare && (
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Chart view"
            className="flex rounded-lg border border-border bg-surface p-0.5"
          >
            <button
              type="button"
              aria-pressed={mode === "single"}
              onClick={() => setMode("single")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                mode === "single"
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-foreground",
              )}
            >
              {symbol} alone
            </button>
            <button
              type="button"
              aria-pressed={mode === "peers"}
              onClick={() => setMode("peers")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                mode === "peers"
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-foreground",
              )}
            >
              vs. peers
            </button>
          </div>

          {mode === "peers" && (
            <p className="text-xs text-muted">
              Against {peerSymbols.join(", ")} — companies in the same industry.
            </p>
          )}
        </div>
      )}

      {mode === "single" ? (
        <PriceChart symbol={symbol} />
      ) : (
        <CompareChart symbols={[symbol, ...peerSymbols]} />
      )}
    </div>
  );
}
