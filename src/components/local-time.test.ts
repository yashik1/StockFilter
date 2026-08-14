import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Timestamps were formatted by whichever machine rendered them. Server
 * components run on the host, whose clock is UTC, so a reader in Vancouver saw
 * times shifted by seven or eight hours with nothing marking them as UTC.
 *
 * These cover the formatting rules directly, since the switch to local time can
 * only happen in a browser.
 */

/** Mirrors the server fallback in local-time.tsx. */
function serverFormat(date: Date, mode: string): string {
  if (Number.isNaN(date.getTime())) return "";
  const iso = date.toISOString();
  switch (mode) {
    case "date":
      return iso.slice(0, 10);
    case "time":
      return `${iso.slice(11, 16)} UTC`;
    case "relative":
      return iso.slice(0, 10);
    default:
      return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  }
}

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
