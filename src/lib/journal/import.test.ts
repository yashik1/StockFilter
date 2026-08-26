import { describe, expect, it } from "vitest";
import { parseDelimited, sniffDelimiter } from "./delimited";
import {
  buildPreview,
  detectColumns,
  parseDate,
  parseNumber,
  parseSide,
} from "./import-map";

/**
 * Reading somebody else's spreadsheet.
 *
 * The failure that matters here is not a rejected file — it is a file that
 * imports cleanly and is wrong. Every case below is one where the obvious
 * implementation produces a plausible number in the wrong column, which is
 * far worse than refusing the row: a rejected row is visible, and a silently
 * shifted one becomes part of a P&L the reader trusts.
 */

describe("splitting a delimited file", () => {
  it("reads a plain comma file", () => {
    const sheet = parseDelimited("Symbol,Qty\nAAPL,100\nMSFT,50");
    expect(sheet.headers).toEqual(["Symbol", "Qty"]);
    expect(sheet.rows).toEqual([
      { Symbol: "AAPL", Qty: "100" },
      { Symbol: "MSFT", Qty: "50" },
    ]);
  });

  /*
    The bug everybody ships first. A notes column containing a comma shifts
    every later column one to the left, so the exit price lands in the stop
    column and the import looks like it worked.
  */
  it("keeps a quoted comma inside its own field", () => {
    const sheet = parseDelimited('Symbol,Notes,Qty\nAAPL,"Broke out, then held",100');
    expect(sheet.rows[0]).toEqual({
      Symbol: "AAPL",
      Notes: "Broke out, then held",
      Qty: "100",
    });
  });

  it("reads a doubled quote as one quote", () => {
    const sheet = parseDelimited('Symbol,Notes\nAAPL,"Bounced off the 20"" line"');
    expect(sheet.rows[0].Notes).toBe('Bounced off the 20" line');
  });

  it("keeps a newline that lives inside a quoted field", () => {
    const sheet = parseDelimited('Symbol,Notes\nAAPL,"first line\nsecond line"\nMSFT,x');
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].Notes).toBe("first line\nsecond line");
    expect(sheet.rows[1].Symbol).toBe("MSFT");
  });

  it("handles Windows line endings", () => {
    const sheet = parseDelimited("Symbol,Qty\r\nAAPL,100\r\n");
    expect(sheet.rows).toEqual([{ Symbol: "AAPL", Qty: "100" }]);
  });

  /*
    Excel writes a byte-order mark by default, which makes the first header
    "﻿Symbol" and matches nothing — so a file exported from Excel would
    fail to detect its own symbol column.
  */
  it("strips the byte-order mark Excel writes", () => {
    const sheet = parseDelimited("﻿Symbol,Qty\nAAPL,100");
    expect(sheet.headers[0]).toBe("Symbol");
  });

  it("sniffs semicolons and tabs, not just commas", () => {
    expect(sniffDelimiter("Symbol;Qty;Price")).toBe(";");
    expect(sniffDelimiter("Symbol\tQty\tPrice")).toBe("\t");
    expect(parseDelimited("Symbol;Qty\nAAPL;100").rows[0]).toEqual({
      Symbol: "AAPL",
      Qty: "100",
    });
  });

  it("does not count a delimiter that is inside quotes when sniffing", () => {
    expect(sniffDelimiter('Symbol,"a;b;c;d;e",Qty')).toBe(",");
  });

  it("skips blank lines rather than making empty trades of them", () => {
    const sheet = parseDelimited("Symbol,Qty\nAAPL,100\n\n\nMSFT,50\n");
    expect(sheet.rows).toHaveLength(2);
  });

  it("pads a short row instead of shifting the next one into it", () => {
    const sheet = parseDelimited("Symbol,Qty,Price\nAAPL,100");
    expect(sheet.rows[0]).toEqual({ Symbol: "AAPL", Qty: "100", Price: "" });
  });

  /*
    Broker exports routinely carry two columns called "Price" — one for the
    open, one for the close. Keyed by name alone, the second silently
    overwrites the first and the entry price becomes the exit price.
  */
  it("keeps both of two identically named columns", () => {
    const sheet = parseDelimited("Price,Price\n10,12");
    expect(sheet.headers).toEqual(["Price", "Price (2)"]);
    expect(sheet.rows[0]).toEqual({ Price: "10", "Price (2)": "12" });
  });

  it("returns nothing for an empty file", () => {
    expect(parseDelimited("").rows).toEqual([]);
    expect(parseDelimited("").headers).toEqual([]);
  });
});

describe("reading numbers", () => {
  it("reads plain and thousands-separated numbers", () => {
    expect(parseNumber("100")).toBe(100);
    expect(parseNumber("1,234.56")).toBeCloseTo(1234.56, 5);
    expect(parseNumber("$1,234.56")).toBeCloseTo(1234.56, 5);
  });

  /*
    The comma is genuinely ambiguous: "1,50" is one and a half across most of
    Europe and one hundred and fifty elsewhere. Read as a decimal only when
    the shape cannot be a thousands group.
  */
  it("reads a European decimal comma without breaking thousands groups", () => {
    expect(parseNumber("1,50")).toBeCloseTo(1.5, 5);
    expect(parseNumber("184,25")).toBeCloseTo(184.25, 5);
    // Three digits after the comma is a thousands group, not a decimal.
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("1,234,567")).toBe(1234567);
  });

  it("reads a bracketed negative, as accounting exports write it", () => {
    expect(parseNumber("(250.00)")).toBeCloseTo(-250, 5);
    expect(parseNumber("-250")).toBe(-250);
  });

  it("refuses anything that is not a number", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
    expect(parseNumber("—")).toBeNull();
  });
});

describe("reading dates", () => {
  it("takes ISO as written", () => {
    expect(parseDate("2026-03-04")).toBe("2026-03-04");
    expect(parseDate("2026-03-04T14:30:00Z")).toBe("2026-03-04");
  });

  /*
    03/04/2026 is two different days depending on where the file came from,
    and there is no way to tell from the row. Reordering only when the first
    number cannot be a month is the one rule that never invents a date.
  */
  it("reorders only when the first number cannot be a month", () => {
    expect(parseDate("13/04/2026")).toBe("2026-04-13");
    expect(parseDate("03/04/2026")).toBe("2026-03-04");
  });

  it("accepts dots and dashes as separators", () => {
    expect(parseDate("13.04.2026")).toBe("2026-04-13");
    expect(parseDate("13-04-2026")).toBe("2026-04-13");
  });

  it("expands a two-digit year", () => {
    expect(parseDate("01/02/26")).toBe("2026-01-02");
    expect(parseDate("01/02/99")).toBe("1999-01-02");
  });

  /*
    A spreadsheet date column exports as a day count with nothing marking it
    as a date. Handed to Date.parse, "45658" becomes the year 45658 and the
    row imports without complaint.
  */
  it("reads a spreadsheet date serial rather than making it a year", () => {
    expect(parseDate("45658")).toBe("2025-01-01");
    expect(parseDate("45658")).not.toContain("45658");
  });

  it("still reads a bare year as a year, not a serial", () => {
    expect(parseDate("2026")).toBe("2026-01-01");
  });

  it("refuses a year no trade could carry", () => {
    // A five-digit year is a misread column, not a trade.
    expect(parseDate("45658-01-01")).toBeNull();
  });

  it("refuses an impossible date rather than rolling it over", () => {
    expect(parseDate("45/45/2026")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("reading the side", () => {
  it("recognises the words a broker uses for a short", () => {
    for (const s of ["short", "Sell", "SLD", "S", "sale", "-1"]) {
      expect(parseSide(s)).toBe("short");
    }
  });

  it("treats anything else as long", () => {
    for (const s of ["long", "Buy", "BOT", "", "1"]) {
      expect(parseSide(s)).toBe("long");
    }
  });
});

describe("guessing which column is which", () => {
  it("maps a typical export", () => {
    const m = detectColumns([
      "Symbol", "Side", "Quantity", "Entry Price", "Exit Price",
      "Stop Loss", "Take Profit", "Commission", "Open Date", "Close Date", "Notes",
    ]);

    expect(m.symbol).toBe("Symbol");
    expect(m.side).toBe("Side");
    expect(m.quantity).toBe("Quantity");
    expect(m.entryPrice).toBe("Entry Price");
    expect(m.exitPrice).toBe("Exit Price");
    expect(m.stopPrice).toBe("Stop Loss");
    expect(m.targetPrice).toBe("Take Profit");
    expect(m.fees).toBe("Commission");
    expect(m.openedAt).toBe("Open Date");
    expect(m.closedAt).toBe("Close Date");
    expect(m.notes).toBe("Notes");
  });

  it("copes with underscores, casing and abbreviations", () => {
    const m = detectColumns(["ticker", "qty", "avg_entry_price", "avg_exit_price", "fees"]);
    expect(m.symbol).toBe("ticker");
    expect(m.quantity).toBe("qty");
    expect(m.entryPrice).toBe("avg_entry_price");
    expect(m.exitPrice).toBe("avg_exit_price");
  });

  /*
    "date" appears in both "Open Date" and "Close Date". Claiming each column
    once is what stops both mapping to the opening date and every trade
    importing as same-day.
  */
  it("does not give one column to two fields", () => {
    const m = detectColumns(["Open Date", "Close Date"]);
    expect(m.openedAt).toBe("Open Date");
    expect(m.closedAt).toBe("Close Date");
    expect(m.openedAt).not.toBe(m.closedAt);
  });

  it("prefers an exact match over a loose one", () => {
    // "price" would match "Entry Price" loosely; the exact column must win.
    const m = detectColumns(["Entry Price", "Price"]);
    expect(m.entryPrice).toBe("Entry Price");
  });

  it("leaves a field unmapped rather than inventing a column", () => {
    const m = detectColumns(["Symbol", "Quantity"]);
    expect(m.stopPrice).toBeUndefined();
    expect(m.notes).toBeUndefined();
  });
});

describe("building the preview", () => {
  const headers = ["Symbol", "Side", "Qty", "Entry", "Exit", "Open Date", "Close Date"];
  const mapping = detectColumns(headers);

  const row = (over: Record<string, string> = {}) => ({
    Symbol: "AAPL", Side: "Buy", Qty: "100", Entry: "10", Exit: "12",
    "Open Date": "2026-01-01", "Close Date": "2026-01-02", ...over,
  });

  it("turns a good row into a trade", () => {
    const { drafts, problems } = buildPreview([row()], mapping);
    expect(problems).toEqual([]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      symbol: "AAPL", side: "long", quantity: 100,
      entryPrice: 10, exitPrice: 12,
      openedAt: "2026-01-01", closedAt: "2026-01-02",
    });
  });

  /*
    Every rejection names the spreadsheet line, because the reader's next
    action is to open the file and look at it — and "row 3" they can find,
    "one row failed" they cannot.
  */
  it("reports a bad row against its line number instead of importing it", () => {
    const { drafts, problems } = buildPreview(
      [row(), row({ Qty: "banana" }), row({ Symbol: "" })],
      mapping,
    );

    expect(drafts).toHaveLength(1);
    expect(problems).toHaveLength(2);
    // Header is line 1, so the second data row is line 3.
    expect(problems[0].line).toBe(3);
    expect(problems[0].reason).toContain("Size");
    expect(problems[1].line).toBe(4);
    expect(problems[1].reason).toContain("symbol");
  });

  it("refuses to preview at all without the required columns", () => {
    const { drafts, missingRequired } = buildPreview([row()], { symbol: "Symbol" });
    expect(drafts).toEqual([]);
    expect(missingRequired).toContain("quantity");
    expect(missingRequired).toContain("entryPrice");
  });

  it("treats a row with no exit as an open position", () => {
    const { drafts } = buildPreview([row({ Exit: "", "Close Date": "" })], mapping);
    expect(drafts[0].exitPrice).toBeNull();
    expect(drafts[0].closedAt).toBeNull();
  });

  /*
    A close date with no price would otherwise produce a half-closed trade,
    which every realised figure reads as open anyway — but which would show a
    close date in the log and look like a bug.
  */
  it("drops a close date that has no exit price behind it", () => {
    const { drafts } = buildPreview([row({ Exit: "" })], mapping);
    expect(drafts[0].closedAt).toBeNull();
  });

  it("dates an exit that has no date of its own to the day it opened", () => {
    const { drafts } = buildPreview([row({ "Close Date": "" })], mapping);
    expect(drafts[0].closedAt).toBe("2026-01-01");
  });

  it("rejects a trade that closes before it opens", () => {
    const { problems } = buildPreview(
      [row({ "Open Date": "2026-02-01", "Close Date": "2026-01-01" })],
      mapping,
    );
    expect(problems[0].reason).toContain("before it opens");
  });

  it("takes a commission as a cost however the export signs it", () => {
    const withFees = detectColumns([...headers, "Commission"]);
    const { drafts } = buildPreview(
      [{ ...row(), Commission: "-4.95" }],
      withFees,
    );
    expect(drafts[0].fees).toBeCloseTo(4.95, 5);
  });

  it("reads a whole European-formatted file end to end", () => {
    const sheet = parseDelimited(
      "Symbol;Side;Qty;Entry;Exit;Open Date;Close Date\n" +
        "AAPL;Buy;100;184,25;191,50;13.01.2026;15.01.2026",
    );
    const { drafts, problems } = buildPreview(sheet.rows, detectColumns(sheet.headers));

    expect(problems).toEqual([]);
    expect(drafts[0].entryPrice).toBeCloseTo(184.25, 5);
    expect(drafts[0].exitPrice).toBeCloseTo(191.5, 5);
    expect(drafts[0].openedAt).toBe("2026-01-13");
    expect(drafts[0].closedAt).toBe("2026-01-15");
  });
});
