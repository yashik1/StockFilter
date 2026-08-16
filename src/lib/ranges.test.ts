import { describe, expect, it } from "vitest";
import { daysSinceStartOfYear, resolveDays } from "./ranges";

/**
 * The year-to-date window.
 *
 * Every other preset is a constant, so this is the only one that can be wrong
 * on a particular day rather than wrong always — which makes the calendar edges
 * the whole test.
 *
 * Dates are constructed with the local-time constructor rather than parsed from
 * an ISO string, because `new Date("2026-01-01")` is UTC midnight and would be
 * the previous year for any reader west of Greenwich — exactly the bug the
 * function exists to avoid.
 */
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("days since the start of the year", () => {
  it("counts one day on the 1st of January, never zero", () => {
    // A zero-width window returns an empty chart, which reads as "this stock
    // has no history" rather than "the year just started".
    expect(daysSinceStartOfYear(local(2026, 1, 1, 0))).toBe(1);
    expect(daysSinceStartOfYear(local(2026, 1, 1, 23))).toBe(1);
  });

  it("grows through the year", () => {
    const jan = daysSinceStartOfYear(local(2026, 1, 15));
    const jun = daysSinceStartOfYear(local(2026, 6, 15));
    const dec = daysSinceStartOfYear(local(2026, 12, 15));

    expect(jan).toBeLessThan(jun);
    expect(jun).toBeLessThan(dec);
    expect(jan).toBe(15);
  });

  it("never exceeds the length of the year", () => {
    expect(daysSinceStartOfYear(local(2026, 12, 31, 23))).toBeLessThanOrEqual(366);
    expect(daysSinceStartOfYear(local(2024, 12, 31, 23))).toBeLessThanOrEqual(366);
  });

  // 2024 is a leap year and 2026 is not, so the same date sits a day apart.
  it("accounts for a leap day", () => {
    expect(daysSinceStartOfYear(local(2024, 3, 1))).toBe(
      daysSinceStartOfYear(local(2026, 3, 1)) + 1,
    );
  });

  it("resets rather than carrying over into a new year", () => {
    const newYearsEve = daysSinceStartOfYear(local(2025, 12, 31));
    const newYearsDay = daysSinceStartOfYear(local(2026, 1, 1));

    expect(newYearsDay).toBe(1);
    expect(newYearsEve).toBeGreaterThan(360);
  });

  it("uses the reader's own calendar, not UTC", () => {
    // Just after midnight on 1 January, local time. Read as UTC in any zone
    // behind Greenwich this instant is still the previous December, which would
    // return a full year instead of one day.
    expect(daysSinceStartOfYear(local(2026, 1, 1, 0))).toBe(1);
  });
});

describe("resolving a window", () => {
  it("passes a fixed number through unchanged", () => {
    expect(resolveDays(182)).toBe(182);
  });

  it("calls a window the calendar decides", () => {
    expect(resolveDays(() => 42)).toBe(42);
  });
});
