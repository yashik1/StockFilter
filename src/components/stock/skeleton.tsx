import { Card } from "@/components/ui";

/**
 * Shown while a stock page fetches its filings.
 *
 * That request takes a couple of seconds against SEC EDGAR, and a blank screen
 * for that long reads as a broken page rather than a loading one. The skeleton
 * mirrors the real layout so nothing jumps when the content lands.
 *
 * Deliberately a component rather than a route-level loading.tsx. A loading
 * file wraps the whole route in a Suspense boundary, which commits the HTTP
 * response before the page runs — so an unknown ticker rendered the correct
 * 404 page under a 200 status. Placing the boundary inside the page keeps the
 * skeleton while leaving the status code correct.
 */
export function StockSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading company financials…</span>

      {/* header */}
      <header className="pt-1">
        <Shimmer className="h-9 w-40" />
        <Shimmer className="mt-2.5 h-4 w-64" />
      </header>

      {/* verdict */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-5">
            <Shimmer className="size-24 rounded-full sm:size-28" />
            <div className="space-y-2.5">
              <Shimmer className="h-2.5 w-28" />
              <Shimmer className="h-6 w-64" />
              <Shimmer className="h-3 w-48" />
            </div>
          </div>
          <div className="space-y-2 lg:ml-auto">
            <Shimmer className="h-2.5 w-24" />
            <Shimmer className="h-8 w-32" />
          </div>
          <div className="flex gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Shimmer className="h-2.5 w-16" />
                <Shimmer className="h-5 w-12" />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* chart */}
      <Card>
        <div className="border-b border-border px-5 py-3.5">
          <Shimmer className="h-4 w-32" />
        </div>
        <div className="p-5">
          <Shimmer className="h-[420px] w-full rounded-[var(--radius)]" />
        </div>
      </Card>

      {/* questions */}
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <Shimmer className="h-4 w-40" />
              <Shimmer className="h-6 w-16 rounded-full" />
            </div>
            <Shimmer className="mt-3 h-3 w-full" />
            <Shimmer className="mt-2 h-3 w-4/5" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * A placeholder block. Uses a pulse rather than a sweeping highlight — the
 * sweep is heavier to paint and this sits behind a network wait, not a
 * decorative one. Honours reduced motion via the global rule.
 */
function Shimmer({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}
