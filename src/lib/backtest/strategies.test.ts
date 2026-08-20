import { describe, expect, it } from "vitest";
import {
  buyAndHold,
  DAILY_STRATEGIES,
  maxDrawdown,
  runAllStrategies,
  runStrategy,
  simulate,
  trendFollowing,
  type Strategy,
} from "./strategies";
import type { Bar } from "../providers/types";

/**
 * Rule-based strategies over daily bars.
 *
 * The arithmetic worth pinning is not any strategy's return — those change
 * with the data — but the two properties that make a backtest honest at all:
 * that a signal cannot act on the bar that produced it, and that being out of
 * the market means earning nothing rather than earning something.
 */

const DAY = 86_400;
const START = 1_700_000_000;

const bar = (time: number, close: number, high = close, low = close): Bar => ({
  time, open: close, high, low, close, volume: 1_000,
});

/** Bars that double, then halve back: 100 → 200 → 100. */
const upDown = [bar(START, 100), bar(START + DAY, 200), bar(START + 2 * DAY, 100)];

describe("the look-ahead offset", () => {
  /*
    The single most important property in this file, and the one whose absence
    is invisible. A signal computed from bar i's close must not also collect
    bar i's own move — that is buying a day that has already happened, and it
    flatters every rule that reacts to sharp moves.
  */
  it("earns the move after the signal, never the move that caused it", () => {
    // Signal true only at index 0, so the position is held for exactly the
    // 100 → 200 leg and is flat for the 200 → 100 leg.
    const { finalValue } = simulate(upDown, [true, false, false], 1000);
    expect(finalValue).toBeCloseTo(2000, 6);
  });

  it("does not collect a move it signalled after", () => {
    // Signal true only at index 1 — after the rise already happened — so it
    // catches only the fall, ending at half.
    const { finalValue } = simulate(upDown, [false, true, false], 1000);
    expect(finalValue).toBeCloseTo(500, 6);
  });

  it("earns nothing at all while flat", () => {
    const { finalValue, barsHeld } = simulate(upDown, [false, false, false], 1000);
    expect(finalValue).toBe(1000);
    expect(barsHeld).toBe(0);
  });
});

describe("counting trades", () => {
  it("counts a completed round trip and scores it as a win", () => {
    // In for the rise, out before the fall.
    const { trades, wins } = simulate(upDown, [true, false, false], 1000);
    expect(trades).toBe(1);
    expect(wins).toBe(1);
  });

  it("scores a round trip that lost as a loss", () => {
    // A fourth bar is needed for the position to actually close: the last
    // signal in a series is never read, because it would mean "hold into a
    // bar that does not exist".
    const withExit = [...upDown, bar(START + 3 * DAY, 100)];
    const { trades, wins } = simulate(withExit, [false, true, false, false], 1000);
    expect(trades).toBe(1);
    expect(wins).toBe(0);
  });

  it("does not count a position still open at the end", () => {
    // Held throughout: nothing was ever sold, so there is no completed trade
    // to have won or lost. Counting it would score an open position on a
    // price that has not been realised.
    const { trades } = simulate(upDown, [true, true, true], 1000);
    expect(trades).toBe(0);
  });
});

describe("buy and hold", () => {
  it("matches the underlying move exactly", () => {
    const result = runStrategy(buyAndHold, upDown, 1000)!;
    // 100 → 200 → 100 is a round trip back to where it started.
    expect(result.finalValue).toBeCloseTo(1000, 6);
    expect(result.totalReturn).toBeCloseTo(0, 6);
    expect(result.timeInMarket).toBe(1);
  });

  it("reports the drawdown the round trip actually had", () => {
    const rising = [bar(START, 100), bar(START + DAY, 200), bar(START + 2 * DAY, 150)];
    const result = runStrategy(buyAndHold, rising, 1000)!;
    // Peak 2000, trough 1500 — a 25% fall from the high.
    expect(result.maxDrawdown).toBeCloseTo(0.25, 6);
  });
});

describe("max drawdown", () => {
  it("measures from the peak, not from the start", () => {
    expect(maxDrawdown([{ value: 100 }, { value: 200 }, { value: 150 }])).toBeCloseTo(0.25, 6);
  });

  it("is zero for a curve that only rises", () => {
    expect(maxDrawdown([{ value: 100 }, { value: 120 }, { value: 140 }])).toBe(0);
  });

  it("keeps the worst fall, not the last one", () => {
    // 100 → 50 is a 50% fall; the later 120 → 110 is only 8%.
    const worst = maxDrawdown([
      { value: 100 }, { value: 50 }, { value: 120 }, { value: 110 },
    ]);
    expect(worst).toBeCloseTo(0.5, 6);
  });
});

describe("signals are computable from the past alone", () => {
  /*
    A strategy that reads ahead would not throw — it would simply return a
    better number. Feeding each strategy a truncated series and checking the
    signals it already emitted do not change is a direct test of that.
  */
  const trending = Array.from({ length: 260 }, (_, i) =>
    bar(START + i * DAY, 100 + i + (i % 7) * 3),
  );

  for (const strategy of DAILY_STRATEGIES) {
    it(`${strategy.name} gives the same answer without the future`, () => {
      const full = strategy.signals(trending);
      const truncated = strategy.signals(trending.slice(0, 200));

      // Every signal the shorter series produced must match the longer one at
      // the same index. A strategy peeking at later bars would disagree here.
      for (let i = 0; i < truncated.length; i++) {
        expect(truncated[i], `${strategy.name} disagrees at bar ${i}`).toBe(full[i]);
      }
    });
  }
});

describe("the 200-day trend rule", () => {
  it("stays out until there is enough history to know the average", () => {
    const flat = Array.from({ length: 100 }, (_, i) => bar(START + i * DAY, 100));
    // 100 bars cannot produce a 200-day average, so there is nothing to be
    // above and the rule must stay in cash rather than defaulting to invested.
    expect(trendFollowing.signals(flat).every((s) => s === false)).toBe(true);
  });

  it("holds once the price is above its 200-day average", () => {
    const rising = Array.from({ length: 260 }, (_, i) => bar(START + i * DAY, 100 + i));
    const signals = trendFollowing.signals(rising);
    expect(signals[259]).toBe(true);
  });
});

describe("running the whole set", () => {
  const series = Array.from({ length: 300 }, (_, i) =>
    bar(START + i * DAY, 100 + Math.sin(i / 10) * 20 + i * 0.2),
  );

  it("returns a result for every strategy", () => {
    expect(runAllStrategies(series, 10_000)).toHaveLength(DAILY_STRATEGIES.length);
  });

  it("never reports being in the market more than all the time", () => {
    for (const r of runAllStrategies(series, 10_000)) {
      expect(r.timeInMarket, r.name).toBeGreaterThanOrEqual(0);
      expect(r.timeInMarket, r.name).toBeLessThanOrEqual(1);
    }
  });

  it("reports a win rate only where trades actually completed", () => {
    for (const r of runAllStrategies(series, 10_000)) {
      if (r.trades === 0) expect(r.winRate, r.name).toBeNull();
      else expect(r.winRate, r.name).toBeCloseTo(r.wins / r.trades, 10);
    }
  });

  it("declines to run on a series too short to mean anything", () => {
    const stub: Strategy = buyAndHold;
    expect(runStrategy(stub, [bar(START, 100)], 1000)).toBeNull();
  });
});
