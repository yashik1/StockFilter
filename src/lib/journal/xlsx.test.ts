import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { excelSerialToDate, readXlsx } from "./xlsx";
import { buildPreview, detectColumns } from "./import-map";

/**
 * Reading a real .xlsx.
 *
 * The fixtures are genuine spreadsheet files — a ZIP of the same XML parts
 * Excel writes — rather than hand-made objects, because everything that can go
 * wrong here is in the container: an entry whose local header disagrees with
 * the central directory, a shared string split across styled runs, a cell
 * simply absent from the XML because it was empty. None of those are visible
 * from a mocked reader, and every one of them shifts a column if mishandled.
 */

function fixture(name: string): ArrayBuffer {
  const bytes = readFileSync(join(__dirname, "fixtures", name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("reading the first worksheet", () => {
  it("reads headers and rows out of a deflated file", async () => {
    const sheet = await readXlsx(fixture("trades.xlsx"));

    expect(sheet.headers).toEqual(["Symbol", "Side", "Qty", "Entry", "Exit", "Notes"]);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows[0]).toMatchObject({
      Symbol: "AAPL", Side: "Buy", Qty: "100", Entry: "10", Exit: "12",
    });
  });

  it("reads a stored, uncompressed file too", async () => {
    const sheet = await readXlsx(fixture("trades-stored.xlsx"));
    expect(sheet.headers[0]).toBe("Symbol");
    expect(sheet.rows[0].Symbol).toBe("AAPL");
  });

  /*
    A shared string that carries styling is stored as several runs. Taking
    only the first <t> would turn "Broke out, then held" into "Broke ".
  */
  it("joins a shared string split across runs", async () => {
    const sheet = await readXlsx(fixture("trades.xlsx"));
    expect(sheet.rows[0].Notes).toBe("Broke out, then held");
  });

  it("unescapes entities rather than leaving them raw", async () => {
    const sheet = await readXlsx(fixture("trades.xlsx"));
    expect(sheet.rows[1].Notes).toBe('Bounced off the 20" line & held');
    expect(sheet.rows[1].Notes).not.toContain("&amp;");
    expect(sheet.rows[1].Notes).not.toContain("&quot;");
  });

  it("reads an inline string as well as a shared one", async () => {
    const sheet = await readXlsx(fixture("trades.xlsx"));
    expect(sheet.rows[1].Symbol).toBe("NVDA");
  });

  /*
    A formula cell stores both the formula and the last computed value. The
    cached value is what an export means, and reading the formula text instead
    would put "SUM(1,1)" in a price column.
  */
  it("takes a formula's cached result, not its text", async () => {
    const sheet = await readXlsx(fixture("trades.xlsx"));
    expect(sheet.rows[1].Exit).toBe("25.5");
  });

  /*
    The one that silently corrupts everything. An empty cell is simply absent
    from the XML, so reading cells in document order slides every later value
    one column to the left — the exit price becomes the entry price and the
    import looks fine.
  */
  it("leaves a gap where a cell was empty rather than shifting the row", async () => {
    const sheet = await readXlsx(fixture("trades.xlsx"));

    // Row 3 in the sheet has no Side and no Entry; NVDA's size must stay in Qty.
    expect(sheet.rows[1].Qty).toBe("50");
    expect(sheet.rows[1].Entry).toBe("");

    // Row 4 has only Symbol, Qty and Entry — Side must be empty, not "7".
    expect(sheet.rows[2]).toMatchObject({
      Symbol: "MSFT", Side: "", Qty: "7", Entry: "3.25", Exit: "",
    });
  });

  it("refuses something that is not a zip, rather than returning nonsense", async () => {
    const notAZip = new TextEncoder().encode("Symbol,Qty\nAAPL,100").buffer;
    await expect(readXlsx(notAZip as ArrayBuffer)).rejects.toThrow();
  });
});

describe("end to end from a spreadsheet", () => {
  it("detects columns and builds trades from a real file", async () => {
    const sheet = await readXlsx(fixture("trades.xlsx"));
    const mapping = detectColumns(sheet.headers);
    const { drafts, problems } = buildPreview(sheet.rows, mapping);

    expect(mapping.symbol).toBe("Symbol");
    expect(mapping.quantity).toBe("Qty");
    expect(mapping.entryPrice).toBe("Entry");
    expect(mapping.exitPrice).toBe("Exit");

    // AAPL and MSFT are complete; NVDA has no entry price and is reported.
    expect(drafts.map((d) => d.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toContain("Entry price");

    expect(drafts[0]).toMatchObject({
      symbol: "AAPL", side: "long", quantity: 100, entryPrice: 10, exitPrice: 12,
    });
  });
});

describe("Excel date serials", () => {
  it("converts the serial Excel stores for a date", () => {
    // 45658 is 2025-01-01 in Excel's 1900 system.
    expect(excelSerialToDate(45658)).toBe("2025-01-01");
    expect(excelSerialToDate(1)).toBe("1900-01-01");
  });

  it("refuses a number that cannot be a date", () => {
    expect(excelSerialToDate(0)).toBeNull();
    expect(excelSerialToDate(-5)).toBeNull();
    expect(excelSerialToDate(9_999_999)).toBeNull();
    expect(excelSerialToDate(Number.NaN)).toBeNull();
  });
});
