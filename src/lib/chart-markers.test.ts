import { describe, expect, it } from "vitest";
import { nearestBar, placeEvents, projectNextEvents } from "./chart-markers";
import type { Bar, CorporateEvent } from "./providers/types";

/**
 * Placing event markers on a price chart.
 *
 * Imports the implementation rather than restating it. An earlier bug in this
 * codebase survived eight passing tests because the test file kept its own copy
 * of the rules and verified the copy.
 *
 * lightweight-charts silently ignores a marker whose time is not present in the
 * series, so a mistake here does not misplace a marker — it removes it, which
 * is far harder to notice.
 */
const DAY = 86_400;
const START = 1_700_000_000;

const bar = (time: number): Bar => ({
  time, open: 10, high: 11, low: 9, close: 10.5, volume: 1000,
});

/** Five consecutive trading days, Monday to Friday. */
const week = Array.from({ length: 5 }, (_, i) => bar(START + i * DAY));

const event = (time: number, kind: CorporateEvent["kind"] = "dividend"): CorporateEvent => ({
  kind, time, label: "27c", detail: "Paid a dividend.",
});

describe("snapping onto a bar", () => {
  it("keeps an exact match", () => {
    for (const b of week) expect(nearestBar(week, b.time)).toBe(b.time);
  });

  it("moves a weekend dividend onto the nearest trading day", () => {
    expect(nearestBar(week, week[4].time + DAY)).toBe(week[4].time);
  });

  it("rounds to whichever side is closer", () => {
    expect(nearestBar(week, week[1].time + DAY / 4)).toBe(week[1].time);
    expect(nearestBar(week, week[2].time - DAY / 4)).toBe(week[2].time);
  });

  it("always lands on a time that exists in the series", () => {
    const times = new Set(week.map((b) => b.time));
    for (let o = -3 * DAY; o <= 8 * DAY; o += DAY / 6) {
      expect(times.has(nearestBar(week, START + o))).toBe(true);
    }
  });

  it("handles a single-bar series without looping forever", () => {
    const one = [bar(START)];
    expect(nearestBar(one, START - 1e6)).toBe(START);
    expect(nearestBar(one, START + 1e6)).toBe(START);
  });
});

describe("placing events in a window", () => {
  it("places each event on a real bar", () => {
    const times = new Set(week.map((b) => b.time));
    const placed = placeEvents([event(week[1].time + DAY / 3), event(week[3].time)], week);

    expect(placed).toHaveLength(2);
    for (const p of placed) expect(times.has(p.time)).toBe(true);
  });

  // A marker piled at the chart edge claims something happened on a day it did not.
  it("drops events from outside the window instead of clamping them", () => {
    const placed = placeEvents(
      [event(START - 30 * DAY), event(START + 60 * DAY), event(week[2].time)],
      week,
    );

    expect(placed).toHaveLength(1);
    expect(placed[0].time).toBe(week[2].time);
  });

  // A weekly chart collapses a quarter into one column, and two labels on one
  // bar overwrite each other.
  it("keeps one marker per kind per bar", () => {
    const placed = placeEvents(
      [event(week[2].time), event(week[2].time + DAY / 8), event(week[2].time, "earnings")],
      week,
    );

    expect(placed.filter((p) => p.kind === "dividend")).toHaveLength(1);
    // A different kind on the same bar is a separate fact and stays.
    expect(placed.filter((p) => p.kind === "earnings")).toHaveLength(1);
  });

  it("returns nothing when there are no bars to attach to", () => {
    expect(placeEvents([event(START)], [])).toEqual([]);
  });

  it("carries the label and a stable id through", () => {
    const [placed] = placeEvents([event(week[0].time, "split")], week);
    expect(placed.label).toBe("27c");
    expect(placed.id).toContain("split");
  });
});

/**
 * Projecting the next results or dividend.
 *
 * No free source publishes confirmed future dates per symbol, so this is the
 * company's own rhythm carried forward — which is honest only where the rhythm
 * is real. The gate is the feature: guessing at an irregular filer would invent
 * a precision the record does not support, and the reader least able to check
 * it is the one this app is written for.
 *
 * The intervals below are the ones actually observed on the live filings.
 */
const NOW = Date.UTC(2026, 7, 16);

function series(kind: CorporateEvent["kind"], gaps: number[]): CorporateEvent[] {
  // Built backwards from a recent date, so the newest sits first.
  let t = Math.floor(NOW / 1000) - 10 * DAY;
  const out: CorporateEvent[] = [{ kind, time: t, label: "x", detail: "" }];
  for (const g of gaps) {
    t -= g * DAY;
    out.push({ kind, time: t, label: "x", detail: "" });
  }
  return out;
}

describe("projecting the next event", () => {
  it("projects a filer that reports like clockwork", () => {
    // Apple: eight consecutive 91-day gaps.
    const [p] = projectNextEvents(series("earnings", [91, 91, 91, 91, 91, 91, 91, 91]), NOW);

    expect(p.kind).toBe("earnings");
    expect(p.intervalDays).toBe(91);
    expect(p.driftDays).toBe(0);
    expect(p.time * 1000).toBeGreaterThan(NOW);
  });

  it("refuses to project an irregular filer", () => {
    // Coca-Cola: gaps from 69 to 120 days. That spacing predicts nothing.
    expect(projectNextEvents(series("earnings", [90, 69, 120, 91, 84, 70, 119, 87]), NOW)).toEqual([]);
  });

  // A truncated filing list leaves a hole that is not a change of schedule.
  it("ignores a gap that is plainly a missing observation", () => {
    // Shopify: six gaps near 90 days and one of 364.
    const [p] = projectNextEvents(series("earnings", [92, 83, 99, 90, 90, 86, 364]), NOW);

    expect(p).toBeDefined();
    expect(p.intervalDays).toBeCloseTo(90, 0);
    expect(p.driftDays).toBeLessThanOrEqual(14);
  });

  it("says nothing when there is too little history to judge", () => {
    expect(projectNextEvents(series("earnings", [91]), NOW)).toEqual([]);
    expect(projectNextEvents([], NOW)).toEqual([]);
  });

  // A board decides a split when it decides one; past spacing says nothing.
  it("never projects a split", () => {
    const splits = projectNextEvents(series("split", [365, 365, 365, 365, 365]), NOW);
    expect(splits.filter((p) => p.kind === "split")).toEqual([]);
  });

  it("does not offer a date that has already passed", () => {
    // Last event long ago, so one interval on still lands in the past.
    const stale = series("earnings", [91, 91, 91, 91]).map((e) => ({
      ...e,
      time: e.time - 400 * DAY,
    }));

    for (const p of projectNextEvents(stale, NOW)) {
      expect(p.time * 1000).toBeGreaterThan(NOW);
    }
  });

  it("reports the drift so the estimate can be read with its uncertainty", () => {
    const [p] = projectNextEvents(series("dividend", [91, 84, 98, 91, 91, 91]), NOW);
    expect(p.driftDays).toBeGreaterThan(0);
    expect(p.driftDays).toBeLessThanOrEqual(14);
  });
});
