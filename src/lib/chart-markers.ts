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

/**
 * When the next results or dividend are likely due.
 *
 * No free source publishes confirmed future dates per symbol — Yahoo's calendar
 * answers 401 without a token this app will not forge, Finnhub's needs a
 * working key, and Nasdaq's is queryable by date rather than by company. What
 * can be known is the company's own rhythm, and for many filers that rhythm is
 * exact: Apple's last eight quarterly reports landed 91 days apart every single
 * time.
 *
 * So this projects rather than reports, and only where the history earns it.
 * Coca-Cola's gaps run from 69 to 120 days and Berkshire's from 63 to 119;
 * projecting those would invent a precision the record does not support, so
 * they get nothing. The result is always labelled as expected, never scheduled
 * — the distinction matters most to the reader least able to check it.
 */
const MAX_DRIFT_DAYS = 14;
const MIN_OBSERVATIONS = 4;
const DAY_SECONDS = 86_400;

export interface ProjectedEvent {
  kind: CorporateEvent["kind"];
  /** Epoch seconds of the expected date. */
  time: number;
  /** Typical gap between occurrences, in days. */
  intervalDays: number;
  /** How far the observed gaps stray from that typical gap, in days. */
  driftDays: number;
}

export function projectNextEvents(events: CorporateEvent[], now = Date.now()): ProjectedEvent[] {
  const projections: ProjectedEvent[] = [];
  const nowSeconds = Math.floor(now / 1000);

  for (const kind of ["earnings", "dividend"] as const) {
    // Splits are deliberately absent: they happen when a board decides one is
    // warranted, not on a cycle, so past spacing predicts nothing at all.
    const times = events
      .filter((e) => e.kind === kind)
      .map((e) => e.time)
      .sort((a, b) => b - a)
      .slice(0, 9);

    if (times.length < MIN_OBSERVATIONS) continue;

    const gaps = times.slice(0, -1).map((t, i) => (t - times[i + 1]) / DAY_SECONDS);
    const median = middle(gaps);
    if (!Number.isFinite(median) || median <= 0) continue;

    /*
      A gap far longer than the rest means an observation is missing, not that
      the company changed its schedule. Shopify's history shows six gaps near 90
      days and one of 364 — three filings dropped off the end of a truncated
      list, not a year of silence. Measuring spread against that outlier put the
      drift at 274 days and threw away a perfectly regular cadence.

      Only clear multiples are discarded. Coca-Cola's gaps run 69 to 120 days
      with nothing beyond, so all of them survive and its drift of 30 days still
      rules it out — which is right, because that spacing really is irregular.
    */
    const observed = gaps.filter((g) => g <= median * 1.5);
    if (observed.length < MIN_OBSERVATIONS - 1) continue;

    const typical = middle(observed);
    const drift = Math.max(...observed.map((g) => Math.abs(g - typical)));
    if (drift > MAX_DRIFT_DAYS) continue;

    const next = times[0] + typical * DAY_SECONDS;
    // A date already past means the event is overdue or was missed by the
    // sources, and guessing further ahead compounds the error.
    if (next <= nowSeconds) continue;

    projections.push({
      kind,
      time: Math.round(next),
      intervalDays: Math.round(typical),
      driftDays: Math.round(drift),
    });
  }

  return projections.sort((a, b) => a.time - b.time);
}

/** Median of a list, which ignores an outlier the way a mean would not. */
function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
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
