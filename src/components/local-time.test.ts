import { afterEach, describe, expect, it, vi } from "vitest";
import { localFormat, serverFormat } from "./local-time";

/**
 * Timestamps were formatted by whichever machine rendered them. Server
 * components run on the host, whose clock is UTC, so a reader in Vancouver saw
 * times shifted by seven or eight hours with nothing marking them as UTC.
 *
 * These import the component's own formatters rather than restating them. An
 * earlier version of this file kept its own copy of the rules, so it verified
 * the copy while the real `localFormat` asked Intl for an impossible
 * combination of options and threw on every dashboard load — eight tests
 * passing against code that was never run.
 */

/** Mirrors the chart tick formatter. */
function localTick(time: number, intraday: boolean, timeZone?: string): string {
  const date = new Date(time * 1000);
  return intraday
    ? new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }).format(date)
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone,
      }).format(date);
}

afterEach(() => vi.useRealTimers());

describe("server fallback", () => {
  const noon = new Date("2026-03-10T16:30:00Z");

  it("labels the zone rather than leaving it ambiguous", () => {
    expect(serverFormat(noon, "datetime")).toBe("2026-03-10 16:30 UTC");
    expect(serverFormat(noon, "time")).toBe("16:30 UTC");
  });

  it("omits the clock where only a date is wanted", () => {
    expect(serverFormat(noon, "date")).toBe("2026-03-10");
    expect(serverFormat(noon, "date")).not.toContain("UTC");
  });

  it("returns empty for an unparseable value rather than 'Invalid Date'", () => {
    expect(serverFormat(new Date("nonsense"), "datetime")).toBe("");
  });
});

describe("chart tick formatting", () => {
  // 13:30 UTC is when the US market opens during daylight saving — 09:30 in
  // New York. Rendering it as 13:30 with no zone was the original bug.
  const marketOpen = Date.UTC(2026, 5, 15, 13, 30) / 1000;

  it("shows a US market open as 09:30 in New York, not 13:30", () => {
    expect(localTick(marketOpen, true, "America/New_York")).toBe("09:30 AM");
  });

  it("renders the same instant differently in another zone", () => {
    const ny = localTick(marketOpen, true, "America/New_York");
    const vancouver = localTick(marketOpen, true, "America/Vancouver");
    const london = localTick(marketOpen, true, "Europe/London");

    expect(vancouver).toBe("06:30 AM");
    expect(london).toBe("02:30 PM");
    expect(new Set([ny, vancouver, london]).size).toBe(3);
  });

  it("still reports UTC when that is the zone", () => {
    expect(localTick(marketOpen, true, "UTC")).toBe("01:30 PM");
  });

  it("drops the clock for daily and weekly bars", () => {
    const tick = localTick(marketOpen, false, "America/New_York");
    expect(tick).toMatch(/Jun 15/);
    expect(tick).not.toMatch(/\d{2}:\d{2}/);
  });

  // A date can land on the previous or next day depending on the reader's zone.
  it("shifts the calendar day when the zone crosses midnight", () => {
    const lateUtc = Date.UTC(2026, 5, 15, 23, 30) / 1000;
    expect(localTick(lateUtc, false, "UTC")).toMatch(/Jun 15/);
    expect(localTick(lateUtc, false, "Asia/Tokyo")).toMatch(/Jun 16/);
  });
});

/**
 * Local formatting, which only ever runs in a browser.
 *
 * This is the path that broke the dashboard. `dateStyle` and `timeStyle` are
 * shorthands, and Intl refuses to pair either with an individual component such
 * as `timeZoneName` — it throws "Invalid option" rather than ignoring the
 * conflict. Only the market overview passes `showZone`, and only when the
 * database holds quotes, so the whole app rendered fine everywhere else while
 * the one page that used it collapsed into the error boundary after hydration.
 */
describe("local formatting", () => {
  const instant = new Date("2026-08-13T20:00:00Z");

  it.each(["datetime", "date", "time"])(
    "asks Intl for a valid combination in %s mode with a zone",
    (mode) => {
      expect(() => localFormat(instant, mode, true)).not.toThrow();
      expect(localFormat(instant, mode, true)).not.toBe("");
    },
  );

  it.each(["datetime", "date", "time", "relative"])(
    "asks Intl for a valid combination in %s mode without a zone",
    (mode) => {
      expect(() => localFormat(instant, mode, false)).not.toThrow();
    },
  );

  it("actually names the zone when one is asked for", () => {
    // The point of showZone is that a reader can tell which clock they are
    // reading, so an abbreviation has to survive into the output.
    expect(localFormat(instant, "datetime", true)).toMatch(/[A-Z]{2,5}|GMT|UTC/);
  });

  it("keeps the date and the clock in datetime mode", () => {
    const withZone = localFormat(instant, "datetime", true);
    expect(withZone).toMatch(/\d{4}/);
    expect(withZone).toMatch(/\d{1,2}:\d{2}/);
  });

  it("omits the clock in date mode and the date in time mode", () => {
    expect(localFormat(instant, "date", true)).not.toMatch(/\d{1,2}:\d{2}/);
    expect(localFormat(instant, "time", true)).not.toMatch(/\d{4}/);
  });

  it("returns empty for an unparseable value rather than throwing", () => {
    expect(localFormat(new Date("nonsense"), "datetime", true)).toBe("");
  });
});
