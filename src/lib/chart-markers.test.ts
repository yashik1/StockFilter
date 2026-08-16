import { describe, expect, it } from "vitest";
import { nearestBar, placeEvents } from "./chart-markers";
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
