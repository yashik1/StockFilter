import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdherencePanel,
  Breakdown,
  EquityCurve,
  StatsHeadline,
} from "./trade-stats";
import {
  adherence,
  bySymbol,
  equityCurve,
  summarise,
  type Trade,
} from "@/lib/journal/trade-math";

/**
 * The journal's panels, rendered with real-shaped data.
 *
 * The arithmetic is tested where it lives. What these check is the framing,
 * which is the part that can quietly mislead: a page that prints "0%" where it
 * means "not enough trades to say", or shows a profit factor of ∞ after two
 * wins, is wrong in a way no unit test of the division would catch.
 *
 * Server-rendered rather than driven in a browser, following the same pattern
 * as the backtest tables — the journal needs both an account and a database,
 * so this is the only place its markup can be exercised without one.
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

const book = [
  trade({ exitPrice: 12, closedAt: "2026-01-02" }),
  trade({ exitPrice: 9, closedAt: "2026-01-03" }),
  trade({ exitPrice: 13, closedAt: "2026-01-04" }),
  trade({ exitPrice: 8, closedAt: "2026-01-05" }),
];

describe("the headline figures", () => {
  it("shows the numbers a reader came for", () => {
    const html = renderToStaticMarkup(<StatsHeadline stats={summarise(book)} />);

    expect(html).toContain("Net P&amp;L");
    expect(html).toContain("Win rate");
    expect(html).toContain("Profit factor");
    expect(html).toContain("Expectancy");
    expect(html).toContain("Max drawdown");
    // Net +200 across four trades, so +$200 and +$50 a trade.
    expect(html).toContain("200");
    expect(html).toContain("50");
  });

  /*
    An empty book must say there is nothing to average, not print zeros. A
    0% win rate over no trades reads as "you lose every time", which is the
    opposite of the truth and the worst thing to show somebody on day one.
  */
  it("says nothing rather than zero when nothing has closed", () => {
    const html = renderToStaticMarkup(<StatsHeadline stats={summarise([])} />);

    expect(html).toContain("Nothing closed yet");
    expect(html).not.toContain("0%");
    expect(html).not.toContain("Win rate");
  });

  it("names the absence of losses rather than dividing by none", () => {
    const winners = [trade({ exitPrice: 12 }), trade({ exitPrice: 13, closedAt: "2026-01-03" })];
    const html = renderToStaticMarkup(<StatsHeadline stats={summarise(winners)} />);

    expect(html).toContain("no losses yet");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("NaN");
  });

  it("says when no stops were set rather than reporting 0R", () => {
    const noStops = book.map((t) => ({ ...t, stopPrice: null }));
    const html = renderToStaticMarkup(<StatsHeadline stats={summarise(noStops)} />);

    expect(html).toContain("no stops set");
    expect(html).not.toContain("0.00R");
  });

  it("counts open positions in the subtitle without letting them into the totals", () => {
    const withOpen = [...book, trade({ exitPrice: null, closedAt: null })];
    const html = renderToStaticMarkup(<StatsHeadline stats={summarise(withOpen)} />);

    expect(html).toContain("4 closed");
    expect(html).toContain("1 still open");
  });
});

describe("the discipline panel", () => {
  it("compares the two halves and states the gap in money", () => {
    const split = [
      trade({ followedRules: true, exitPrice: 12 }),
      trade({ followedRules: true, exitPrice: 13, closedAt: "2026-01-03" }),
      trade({ followedRules: false, exitPrice: 8, closedAt: "2026-01-04" }),
      trade({ followedRules: false, exitPrice: 7, closedAt: "2026-01-05" }),
    ];
    const html = renderToStaticMarkup(<AdherencePanel adherence={adherence(split)} />);

    expect(html).toContain("Kept to the rules");
    expect(html).toContain("Broke them");
    expect(html).toContain("worth");
  });

  /*
    The reverse case has to be worded carefully. Reporting that breaking the
    rules did better, without qualification, reads as permission — so it is
    framed as a question about the rules, with the small-sample caveat
    attached.
  */
  it("does not read as permission when breaking the rules did better", () => {
    const split = [
      trade({ followedRules: true, exitPrice: 8 }),
      trade({ followedRules: false, exitPrice: 13, closedAt: "2026-01-03" }),
    ];
    const html = renderToStaticMarkup(<AdherencePanel adherence={adherence(split)} />);

    expect(html).toContain("question about the rules");
    expect(html).toContain("counts are small");
  });

  it("invites the reader in rather than showing an empty comparison", () => {
    const html = renderToStaticMarkup(<AdherencePanel adherence={adherence(book)} />);
    expect(html).toContain("say whether you kept to your own rules");
  });

  it("reports how many trades sat out the comparison", () => {
    const mixed = [
      trade({ followedRules: true, exitPrice: 12 }),
      trade({ followedRules: null, exitPrice: 8, closedAt: "2026-01-03" }),
    ];
    const html = renderToStaticMarkup(<AdherencePanel adherence={adherence(mixed)} />);
    expect(html).toContain("left unanswered");
  });
});

describe("the breakdown table", () => {
  it("lists each group with its own figures", () => {
    const mixed = [
      trade({ symbol: "AAPL", exitPrice: 12 }),
      trade({ symbol: "TSLA", exitPrice: 8, closedAt: "2026-01-03" }),
    ];
    const html = renderToStaticMarkup(
      <Breakdown title="By symbol" subtitle="x" groups={bySymbol(mixed)} emptyLabel="none" />,
    );

    expect(html).toContain("AAPL");
    expect(html).toContain("TSLA");
    expect(html).toContain("Profit factor");
  });

  it("shows the empty label rather than an empty table", () => {
    const html = renderToStaticMarkup(
      <Breakdown title="By strategy" subtitle="x" groups={[]} emptyLabel="Nothing attributed yet." />,
    );

    expect(html).toContain("Nothing attributed yet.");
    expect(html).not.toContain("<table");
  });
});

describe("the equity curve", () => {
  it("draws a path and labels the ends", () => {
    const html = renderToStaticMarkup(<EquityCurve points={equityCurve(book)} />);

    expect(html).toContain("<svg");
    expect(html).toContain("<path");
    expect(html).toContain("2026-01-02");
    expect(html).toContain("2026-01-05");
    // Described for a screen reader, since the shape carries the meaning.
    expect(html).toContain("role=\"img\"");
    expect(html).toContain("aria-label");
  });

  it("emits no NaN into the path data", () => {
    const html = renderToStaticMarkup(<EquityCurve points={equityCurve(book)} />);
    expect(html).not.toContain("NaN");
  });

  /*
    A flat book has a zero range. Dividing by it would put every point at NaN
    and render an invisible path with a visible frame around it.
  */
  it("survives a book that nets exactly zero", () => {
    const flat = [
      trade({ exitPrice: 12, closedAt: "2026-01-02" }),
      trade({ exitPrice: 8, closedAt: "2026-01-03" }),
    ];
    const html = renderToStaticMarkup(<EquityCurve points={equityCurve(flat)} />);

    expect(html).not.toContain("NaN");
    expect(html).toContain("<path");
  });

  it("draws nothing at all with fewer than two points", () => {
    expect(renderToStaticMarkup(<EquityCurve points={[]} />)).toBe("");
    expect(
      renderToStaticMarkup(<EquityCurve points={[{ date: "2026-01-01", value: 5 }]} />),
    ).toBe("");
  });
});
