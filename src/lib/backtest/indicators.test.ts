import { describe, expect, it } from "vitest";
import { ema, rsi, sma } from "./indicators";

/**
 * Moving averages and RSI.
 *
 * Every expected value here is arithmetic anyone can check by hand, which is
 * the point: an indicator that is subtly wrong still draws a plausible line,
 * so "it looks like a moving average" proves nothing. The alignment cases
 * matter most — an off-by-`period` error shifts the whole series against the
 * bars it describes and is invisible on a chart.
 */

describe("simple moving average", () => {
  it("averages exactly the last N values", () => {
    // Last 3 of [1,2,3,4,5]: (1+2+3)/3 = 2, (2+3+4)/3 = 3, (3+4+5)/3 = 4.
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("returns null until there is a full window, so nothing misaligns", () => {
    const out = sma([10, 20, 30, 40], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out).toHaveLength(4);
  });

  it("stays aligned to its input length on a long series", () => {
    const values = Array.from({ length: 500 }, (_, i) => i + 1);
    const out = sma(values, 50);

    expect(out).toHaveLength(500);
    // A straight 1..500 ramp: the 50-period average at index 49 is the mean
    // of 1..50 = 25.5.
    expect(out[49]).toBeCloseTo(25.5, 10);
    expect(out[499]).toBeCloseTo((451 + 500) / 2, 10);
  });

  it("handles a period longer than the data without inventing values", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  it("is unaffected by a running-sum drift over many bars", () => {
    // The implementation keeps a running sum rather than re-summing each
    // window; on a constant series every output must be exactly that constant.
    const flat = new Array(1000).fill(7);
    const out = sma(flat, 20);
    for (const v of out.slice(19)) expect(v).toBeCloseTo(7, 10);
  });
});

describe("exponential moving average", () => {
  it("seeds on the simple average of the first window", () => {
    // First 3 of [1,2,3,4,5] average to 2, so index 2 is exactly 2.
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[2]).toBeCloseTo(2, 10);
  });

  it("applies the standard 2/(period+1) multiplier thereafter", () => {
    // Seed 2 at index 2. Multiplier for period 3 is 0.5.
    // index 3: (4 - 2) * 0.5 + 2 = 3
    // index 4: (5 - 3) * 0.5 + 3 = 4
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[3]).toBeCloseTo(3, 10);
    expect(out[4]).toBeCloseTo(4, 10);
  });

  it("leaves the pre-window positions null", () => {
    expect(ema([1, 2, 3, 4, 5], 3).slice(0, 2)).toEqual([null, null]);
  });

  it("converges to a constant series rather than drifting", () => {
    const flat = new Array(200).fill(42);
    const out = ema(flat, 20);
    expect(out[199]).toBeCloseTo(42, 10);
  });

  it("returns all nulls when there is less data than the period", () => {
    expect(ema([1, 2, 3], 10)).toEqual([null, null, null]);
  });

  // An outlying early price has to wash out, not sit in the line forever.
  // Checked as monotonic decay toward the true level rather than against an
  // arbitrary threshold: with period 3 the excess halves each bar, so a
  // seed of (1000+10+10)/3 = 340 is still 12.58 by index 9 — correct, and
  // well above any round number worth asserting.
  it("decays an outlying early value toward the true level, bar by bar", () => {
    const withSpike = [1000, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    const out = ema(withSpike, 3).slice(2) as number[];

    for (let i = 1; i < out.length; i++) {
      const before = Math.abs(out[i - 1] - 10);
      const after = Math.abs(out[i] - 10);
      expect(after, `bar ${i} should be closer to 10 than bar ${i - 1}`).toBeLessThan(before);
    }

    // And it genuinely converges rather than merely inching: the final
    // distance is a small fraction of where it started.
    expect(Math.abs(out[out.length - 1] - 10)).toBeLessThan(Math.abs(out[0] - 10) * 0.05);
  });
});

describe("relative strength index", () => {
  it("reports 100 when a window has no losing days", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    const out = rsi(rising, 14);
    expect(out[29]).toBe(100);
  });

  it("stays within 0 and 100 on a volatile series", () => {
    const noisy = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 3) * 20 + (i % 7));
    for (const v of rsi(noisy, 14)) {
      if (v == null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("sits near 50 when gains and losses are evenly matched", () => {
    // Alternating +1 / -1 gives equal average gain and loss, so RS = 1.
    const zigzag = Array.from({ length: 100 }, (_, i) => 100 + (i % 2));
    const out = rsi(zigzag, 14);
    expect(out[99]).toBeGreaterThan(40);
    expect(out[99]).toBeLessThan(60);
  });

  it("is null until a full period of changes exists", () => {
    const out = rsi([1, 2, 3, 4, 5], 14);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it("keeps the output aligned with the input series", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + (i % 5));
    const out = rsi(values, 14);

    expect(out).toHaveLength(60);
    // First defined value sits at index `period`, since it needs `period`
    // changes and a change consumes the bar before it.
    expect(out[13]).toBeNull();
    expect(out[14]).not.toBeNull();
  });
});
