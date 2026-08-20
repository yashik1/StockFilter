import { describe, expect, it } from "vitest";
import { runOpeningRangeBreakout } from "./opening-range";
import type { Bar } from "../providers/types";

/**
 * Opening Range Breakout over intraday bars.
 *
 * Sessions here are built by hand so each case has one obvious right answer:
 * a clean break upward, a clean break downward, and a session that never
 * leaves its range. The short-side return sign is the arithmetic most likely
 * to be quietly wrong — a short that "gained" when the price rose would
 * inflate every downtrending day — so it gets its own case.
 */

/** 09:30 ET on an arbitrary weekday, as a UTC timestamp. */
const SESSION_OPEN = Date.UTC(2026, 4, 4, 13, 30, 0) / 1000;
const MINUTE = 60;
const OPTIONS = { rangeMinutes: 15, barMinutes: 5 };

const bar = (time: number, high: number, low: number, close: number): Bar => ({
  time, open: (high + low) / 2, high, low, close, volume: 1_000,
});

/**
 * A session with a 15-minute opening range (three 5-minute bars) between 100
 * and 110, followed by `rest` bars.
 */
function session(dayOffsetDays: number, rest: Bar[]): Bar[] {
  const open = SESSION_OPEN + dayOffsetDays * 86_400;
  return [
    bar(open, 108, 100, 105),
    bar(open + 5 * MINUTE, 110, 102, 107),
    bar(open + 10 * MINUTE, 109, 101, 104),
    ...rest.map((b, i) => ({ ...b, time: open + (15 + i * 5) * MINUTE })),
  ];
}

describe("a clean upward break", () => {
  // Range is 100–110. Price pushes to 115 then closes the session at 120.
  const bars = session(0, [bar(0, 115, 108, 114), bar(0, 121, 113, 120)]);
  const result = runOpeningRangeBreakout(bars, 10_000, OPTIONS);

  it("takes a long trade", () => {
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].direction).toBe("long");
  });

  it("enters at the range high, not at the bar's own high", () => {
    // The break is assumed filled at the level that triggered it. Using the
    // bar's high instead would enter at the best price of the bar, which is
    // not a fill anyone could rely on getting.
    expect(result.trades[0].entryPrice).toBe(110);
  });

  it("exits on the session's final close, never overnight", () => {
    expect(result.trades[0].exitPrice).toBe(120);
  });

  it("computes the gain from entry to exit", () => {
    // 120 / 110 - 1
    expect(result.trades[0].returnPct).toBeCloseTo(120 / 110 - 1, 10);
    expect(result.wins).toBe(1);
  });
});

describe("a clean downward break", () => {
  // Range is 100–110. Price breaks to 95 and closes at 90 — a short that won.
  const bars = session(0, [bar(0, 104, 95, 96), bar(0, 97, 89, 90)]);
  const result = runOpeningRangeBreakout(bars, 10_000, OPTIONS);

  it("takes a short trade at the range low", () => {
    expect(result.trades[0].direction).toBe("short");
    expect(result.trades[0].entryPrice).toBe(100);
  });

  it("scores a falling price as a gain, not a loss", () => {
    /*
      The sign flip that matters. Shorting at 100 and covering at 90 is a
      +11.1% gain, and computing it the long way round would report -10% —
      turning every correctly-called decline into a loss and making the whole
      strategy look inverted.
    */
    expect(result.trades[0].returnPct).toBeCloseTo(100 / 90 - 1, 10);
    expect(result.trades[0].returnPct).toBeGreaterThan(0);
    expect(result.wins).toBe(1);
  });

  it("scores a short that went the wrong way as a loss", () => {
    // Breaks down to 99, then rallies back to close at 115.
    const reversed = session(0, [bar(0, 104, 99, 101), bar(0, 116, 100, 115)]);
    const r = runOpeningRangeBreakout(reversed, 10_000, OPTIONS);
    expect(r.trades[0].direction).toBe("short");
    expect(r.trades[0].returnPct).toBeLessThan(0);
    expect(r.wins).toBe(0);
  });
});

describe("a session that never breaks out", () => {
  // Everything stays inside 100–110.
  const bars = session(0, [bar(0, 108, 103, 105), bar(0, 107, 104, 106)]);
  const result = runOpeningRangeBreakout(bars, 10_000, OPTIONS);

  it("takes no trade at all", () => {
    expect(result.trades).toHaveLength(0);
  });

  it("still counts the session as tested", () => {
    // Counting only the days that traded would quietly raise the win rate by
    // dropping every day the rule found nothing to do.
    expect(result.sessionsTested).toBe(1);
    expect(result.sessionsWithoutBreakout).toBe(1);
  });

  it("leaves the balance untouched", () => {
    expect(result.totalReturn).toBe(0);
  });
});

describe("across several sessions", () => {
  const bars = [
    ...session(0, [bar(0, 115, 108, 114), bar(0, 121, 113, 120)]), // long, wins
    ...session(1, [bar(0, 104, 95, 96), bar(0, 97, 89, 90)]),      // short, wins
    ...session(2, [bar(0, 108, 103, 105), bar(0, 107, 104, 106)]), // no break
  ];
  const result = runOpeningRangeBreakout(bars, 10_000, OPTIONS);

  it("treats each day independently", () => {
    expect(result.sessionsTested).toBe(3);
    expect(result.trades).toHaveLength(2);
  });

  it("takes the win rate over trades, not over sessions", () => {
    expect(result.winRate).toBeCloseTo(1, 10);
  });

  it("compounds the trades into one balance", () => {
    const expected = (120 / 110) * (100 / 90) - 1;
    expect(result.totalReturn).toBeCloseTo(expected, 8);
  });

  it("reports the best and worst single day", () => {
    expect(result.bestTrade).toBeCloseTo(100 / 90 - 1, 8);
    expect(result.worstTrade).toBeCloseTo(120 / 110 - 1, 8);
  });
});

describe("sessions it refuses to trade", () => {
  it("skips a session with too few bars to form a range", () => {
    const open = SESSION_OPEN;
    const stub = [bar(open, 108, 100, 105), bar(open + 5 * MINUTE, 110, 102, 107)];
    const result = runOpeningRangeBreakout(stub, 10_000, OPTIONS);
    // Two 5-minute bars cannot make a 15-minute range, let alone leave room
    // to break out of it. A truncated day at either end of the fetched window
    // is exactly this shape.
    expect(result.sessionsTested).toBe(0);
    expect(result.trades).toHaveLength(0);
  });

  it("returns an empty result rather than throwing on no bars", () => {
    const result = runOpeningRangeBreakout([], 10_000, OPTIONS);
    expect(result.trades).toHaveLength(0);
    expect(result.winRate).toBeNull();
  });
});
