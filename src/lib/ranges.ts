/**
 * Windows a chart can be asked to show.
 *
 * Every preset but one is a fixed count of days back from now. Year-to-date is
 * anchored to the calendar instead, so its length changes every day — 5 days in
 * early January, 364 by New Year's Eve — and cannot be written as a constant.
 */

/**
 * Days from the start of the current year to now.
 *
 * Measured in the reader's own timezone, which is the only reading of "this
 * year" that matches the calendar on their wall: someone in Auckland enters a
 * new year while it is still December in New York, and anchoring to UTC would
 * show them the wrong one for most of a day. The chart's own axis is already
 * drawn in local time, so this keeps the window and its labels in agreement.
 *
 * Never returns zero. On the 1st of January there is no completed trading day
 * yet, and a window of no width returns an empty chart rather than an
 * explanation, so the floor is one day.
 */
export function daysSinceStartOfYear(now: Date = new Date()): number {
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const elapsed = now.getTime() - startOfYear.getTime();

  return Math.max(1, Math.ceil(elapsed / 86_400_000));
}

/** A fixed window, or one the calendar decides. */
export type RangeDays = number | (() => number);

export function resolveDays(days: RangeDays): number {
  return typeof days === "function" ? days() : days;
}
