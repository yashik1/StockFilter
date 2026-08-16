import type { Bar, CorporateEvent } from "./providers/types";

/**
 * Deciding where each event marker goes.
 *
 * Kept apart from the chart component so it can be tested without a charting
 * library or a canvas — and imported by both, rather than restated in the test,
 * which is how an earlier bug in this codebase survived a green suite.
 */

export interface PlacedEvent {
  /** A bar time that exists in the series. */
  time: number;
  kind: CorporateEvent["kind"];
  label: string;
  id: string;
}

/**
 * Snaps events onto real bars and drops those outside the window.
 *
 * Snapping is not cosmetic. lightweight-charts silently ignores a marker whose
 * time is not present in the series, so an unsnapped marker does not land in
 * the wrong place — it disappears. A dividend paid on a Saturday has no bar of
 * its own, and on an intraday chart almost nothing lines up, which is precisely
 * where a reader is looking closely enough to notice.
 *
 * Events beyond the window are discarded rather than pinned to the edge: a
 * marker stacked at the start of the chart asserts something happened on a day
 * it did not.
 */
export function placeEvents(events: CorporateEvent[], bars: Bar[]): PlacedEvent[] {
  if (bars.length === 0) return [];

  const first = bars[0].time;
  const last = bars[bars.length - 1].time;
  const spacing = bars.length > 1 ? bars[1].time - bars[0].time : 86_400;

  const placed = events
    .filter((e) => e.time >= first - spacing && e.time <= last + spacing)
    .map((e) => ({
      time: nearestBar(bars, e.time),
      kind: e.kind,
      label: e.label,
      id: `${e.kind}-${e.time}`,
    }));

  // Two events of one kind can snap onto the same bar — a coarse weekly chart
  // collapses a whole quarter into one column. Keeping both would stack their
  // labels on top of each other.
  const seen = new Set<string>();
  return placed.filter((p) => {
    const key = `${p.kind}:${p.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Binary search for the bar closest in time to an event. */
export function nearestBar(bars: { time: number }[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }

  const after = bars[lo].time;
  const before = lo > 0 ? bars[lo - 1].time : after;
  return Math.abs(after - time) < Math.abs(time - before) ? after : before;
}
