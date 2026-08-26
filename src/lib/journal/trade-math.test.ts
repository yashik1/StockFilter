import { describe, expect, it } from "vitest";
import {
  adherence,
  bySymbol,
  equityCurve,
  plannedR,
  plannedRisk,
  realisedPnl,
  realisedR,
  summarise,
  type Trade,
} from "./trade-math";

/**
 * The arithmetic behind the trade journal.
 *
 * These figures are the ones a reader will use to decide whether to keep
 * doing something, so the cases pinned here are the ones where the obvious
 * implementation quietly reports the opposite of the truth: a profitable
 * short read as a loss, an open position dragging an average toward zero, a
 * profit factor of infinity read as an edge.
 */

let nextId = 1;
function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: nextId++,
    symbol: "AAPL",
    side: "long",
    quantity: 100,
    entryPrice: 10,
    exitPrice: 12,
    stopPrice: 9,
    targetPrice: 14,
    fees: 0,
    openedAt: "2026-01-01",
    closedAt: "2026-01-02",
    playbookId: null,
    followedRules: null,
    notes: "",
    ...over,
  };
}

describe("one trade", () => {
  it("computes a long profit", () => {
    expect(realisedPnl(trade())).toBe(200);
  });

  /*
    The sign trap. A short is profitable when the exit is below the entry, so
    a single hard-coded subtraction reports every winning short as a loss of
    exactly the same size — which is worse than no number at all.
  */
  it("computes a short profit, rather than the loss a long would have made", () => {
    const short = trade({ side: "short", entryPrice: 12, exitPrice: 10 });
    expect(realisedPnl(short)).toBe(200);

    const shortLoss = trade({ side: "short", entryPrice: 10, exitPrice: 12 });
    expect(realisedPnl(shortLoss)).toBe(-200);
  });

  it("takes fees off the result", () => {
    expect(realisedPnl(trade({ fees: 15 }))).toBe(185);
    expect(realisedPnl(trade({ exitPrice: 9, fees: 15 }))).toBe(-115);
  });

  it("reports nothing realised while the position is open", () => {
    expect(realisedPnl(trade({ exitPrice: null, closedAt: null }))).toBeNull();
    expect(realisedR(trade({ exitPrice: null, closedAt: null }))).toBeNull();
  });
});

describe("risk and R", () => {
  it("measures planned risk from entry to stop, on both sides", () => {
    expect(plannedRisk(trade())).toBe(100);
    expect(plannedRisk(trade({ side: "short", entryPrice: 10, stopPrice: 11 }))).toBe(100);
  });

  it("expresses the result as a multiple of what was risked", () => {
    expect(realisedR(trade())).toBeCloseTo(2, 5);
    expect(realisedR(trade({ exitPrice: 9 }))).toBeCloseTo(-1, 5);
  });

  /*
    Without a stop there is no defined risk, so there is no multiple of it.
    Returning 0 would put a stopless trade in the middle of the distribution
    and drag the average R toward nothing.
  */
  it("has no R without a stop", () => {
    expect(plannedRisk(trade({ stopPrice: null }))).toBeNull();
    expect(realisedR(trade({ stopPrice: null }))).toBeNull();
  });

  it("refuses a stop on the wrong side of the entry", () => {
    expect(plannedRisk(trade({ side: "long", entryPrice: 10, stopPrice: 11 }))).toBeNull();
    expect(plannedRisk(trade({ side: "short", entryPrice: 10, stopPrice: 9 }))).toBeNull();
  });

  it("reports the reward-to-risk the trade was taken for", () => {
    // Risk 1, reward 4.
    expect(plannedR(trade())).toBeCloseTo(4, 5);
    expect(plannedR(trade({ targetPrice: null }))).toBeNull();
  });

  /*
    Fees are deliberately outside R. Folding them in makes a textbook 1R
    winner read as 0.97R for reasons that say nothing about the setup.
  */
  it("keeps fees out of the risk figure", () => {
    expect(plannedRisk(trade({ fees: 50 }))).toBe(100);
  });
});

describe("a book of trades", () => {
  const book = [
    trade({ exitPrice: 12 }),                    // +200
    trade({ exitPrice: 9, closedAt: "2026-01-03" }),  // -100
    trade({ exitPrice: 13, closedAt: "2026-01-04" }), // +300
    trade({ exitPrice: 8, closedAt: "2026-01-05" }),  // -200
  ];

  it("adds up the way a broker statement would", () => {
    const s = summarise(book);
    expect(s.closed).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.netPnl).toBe(200);
    expect(s.grossProfit).toBe(500);
    expect(s.grossLoss).toBe(300);
    expect(s.winRate).toBeCloseTo(0.5, 5);
    expect(s.profitFactor).toBeCloseTo(500 / 300, 5);
  });

  it("reports what one more trade is worth", () => {
    // Expectancy is mean P&L per closed trade: 200 / 4.
    expect(summarise(book).expectancy).toBeCloseTo(50, 5);
  });

  it("averages wins and losses separately, both as positive magnitudes", () => {
    const s = summarise(book);
    expect(s.avgWin).toBeCloseTo(250, 5);
    expect(s.avgLoss).toBeCloseTo(150, 5);
    expect(s.largestWin).toBe(300);
    expect(s.largestLoss).toBe(200);
  });

  /*
    A book with no losing trade has no profit factor. Infinity sorts and
    formats as a number, and a three-trade winning streak would then display
    an "edge" of ∞ — the honest reading is that there is nothing to divide by.
  */
  it("has no profit factor until something has been lost", () => {
    const s = summarise([trade({ exitPrice: 12 }), trade({ exitPrice: 13 })]);
    expect(s.profitFactor).toBeNull();
    expect(Number.isFinite(s.profitFactor ?? 0)).toBe(true);
    expect(s.winRate).toBe(1);
  });

  it("counts a flat result apart from wins, so it cannot pad the win rate", () => {
    const s = summarise([trade({ exitPrice: 10 }), trade({ exitPrice: 12 })]);
    expect(s.breakeven).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.winRate).toBeCloseTo(0.5, 5);
  });

  /*
    An open position has no realised result. Treating it as zero would count
    it as a breakeven trade and pull every average toward nothing.
  */
  it("leaves open positions out of every realised figure", () => {
    const s = summarise([...book, trade({ exitPrice: null, closedAt: null })]);
    expect(s.open).toBe(1);
    expect(s.closed).toBe(4);
    expect(s.netPnl).toBe(200);
    expect(s.breakeven).toBe(0);
  });

  it("says nothing at all about an empty book", () => {
    const s = summarise([]);
    expect(s.closed).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.expectancy).toBeNull();
    expect(s.netPnl).toBe(0);
  });
});

describe("drawdown", () => {
  /*
    Measured peak-to-trough on the running total in close order, not as the
    largest single loss. A book that makes 500 and then gives back 400 across
    four trades has a 400 drawdown and no single loss anywhere near it.
  */
  it("measures the give-back from the high-water mark, not the worst trade", () => {
    const s = summarise([
      trade({ exitPrice: 15, closedAt: "2026-01-01" }), // +500, peak 500
      trade({ exitPrice: 9, closedAt: "2026-01-02" }),  // -100 -> 400
      trade({ exitPrice: 9, closedAt: "2026-01-03" }),  // -100 -> 300
      trade({ exitPrice: 8, closedAt: "2026-01-04" }),  // -200 -> 100
    ]);
    expect(s.maxDrawdown).toBe(400);
    expect(s.largestLoss).toBe(200);
  });

  it("walks in close order regardless of the order given", () => {
    const late = trade({ exitPrice: 8, closedAt: "2026-03-01" });
    const early = trade({ exitPrice: 15, closedAt: "2026-01-01" });
    expect(summarise([late, early]).maxDrawdown).toBe(200);
    // Reversed input, same answer.
    expect(summarise([early, late]).maxDrawdown).toBe(200);
  });

  it("is zero for a book that only ever went up", () => {
    expect(summarise([trade({ exitPrice: 12 }), trade({ exitPrice: 13, closedAt: "2026-01-03" })]).maxDrawdown).toBe(0);
  });
});

describe("the current streak", () => {
  it("counts consecutive wins at the end of the book", () => {
    expect(summarise([
      trade({ exitPrice: 8, closedAt: "2026-01-01" }),
      trade({ exitPrice: 12, closedAt: "2026-01-02" }),
      trade({ exitPrice: 12, closedAt: "2026-01-03" }),
    ]).streak).toBe(2);
  });

  it("counts consecutive losses as a negative number", () => {
    expect(summarise([
      trade({ exitPrice: 12, closedAt: "2026-01-01" }),
      trade({ exitPrice: 8, closedAt: "2026-01-02" }),
      trade({ exitPrice: 9, closedAt: "2026-01-03" }),
    ]).streak).toBe(-2);
  });
});

describe("grouping", () => {
  it("ranks symbols by what they actually made", () => {
    const groups = bySymbol([
      trade({ symbol: "AAPL", exitPrice: 12 }),
      trade({ symbol: "TSLA", exitPrice: 8, closedAt: "2026-01-03" }),
      trade({ symbol: "AAPL", exitPrice: 13, closedAt: "2026-01-04" }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(["AAPL", "TSLA"]);
    expect(groups[0].stats.netPnl).toBe(500);
    expect(groups[1].stats.netPnl).toBe(-200);
  });
});

describe("rule adherence", () => {
  /*
    The comparison the journal exists to make. A strategy that makes money
    when followed and loses money overall is a discipline problem, not a bad
    strategy, and no other figure in a P&L report tells those apart.
  */
  it("separates the book by whether the rules were kept", () => {
    const a = adherence([
      trade({ followedRules: true, exitPrice: 12 }),
      trade({ followedRules: true, exitPrice: 13, closedAt: "2026-01-03" }),
      trade({ followedRules: false, exitPrice: 8, closedAt: "2026-01-04" }),
      trade({ followedRules: false, exitPrice: 7, closedAt: "2026-01-05" }),
    ]);

    expect(a.followed.netPnl).toBe(500);
    expect(a.broke.netPnl).toBe(-500);
    expect(a.followed.winRate).toBe(1);
    expect(a.broke.winRate).toBe(0);
    // 250 a trade against -250 a trade.
    expect(a.costPerTrade).toBeCloseTo(500, 5);
  });

  it("leaves an unanswered trade out of both sides rather than guessing", () => {
    const a = adherence([
      trade({ followedRules: true, exitPrice: 12 }),
      trade({ followedRules: null, exitPrice: 8, closedAt: "2026-01-03" }),
    ]);

    expect(a.followed.closed).toBe(1);
    expect(a.broke.closed).toBe(0);
    expect(a.unanswered).toBe(1);
    expect(a.costPerTrade).toBeNull();
  });

  it("offers no comparison until both sides have something in them", () => {
    const a = adherence([trade({ followedRules: true, exitPrice: 12 })]);
    expect(a.costPerTrade).toBeNull();
  });
});

describe("the equity curve", () => {
  it("runs cumulatively in close order and ends at net P&L", () => {
    const book = [
      trade({ exitPrice: 12, closedAt: "2026-01-02" }),
      trade({ exitPrice: 8, closedAt: "2026-01-01" }),
    ];
    const curve = equityCurve(book);

    expect(curve.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-02"]);
    expect(curve.map((p) => p.value)).toEqual([-200, 0]);
    expect(curve[curve.length - 1].value).toBe(summarise(book).netPnl);
  });

  it("is empty for a book with nothing closed", () => {
    expect(equityCurve([trade({ exitPrice: null, closedAt: null })])).toEqual([]);
  });
});
