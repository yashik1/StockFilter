import { describe, expect, it } from "vitest";
import {
  isShareholding,
  normalizeQuarter,
  resolveManagerPosition,
  summarisePositions,
  type FilingPosition,
} from "./institutional";

/**
 * Reading Form 13F.
 *
 * Nearly every case here is a way of counting the same shares twice, or of
 * counting something that is not a shareholding at all. The raw data does not
 * complain about any of them — a wrong total looks exactly like a right one —
 * so these are pinned against figures checked by hand against the SEC's own
 * files.
 */

const filing = (over: Partial<FilingPosition> = {}): FilingPosition => ({
  accession: "0002100119-26-001306",
  shares: 953_847_648,
  value: 241_720_924_860,
  isRestatement: false,
  filedAt: "2026-05-14",
  ...over,
});

describe("resolving a manager's position", () => {
  /*
    The bug this function exists for.

    Vanguard's Q1 2026 report on Apple appears twice under one CIK with an
    identical 953,847,648 shares — once as the original and once as a
    RESTATEMENT amendment. Summing them credits Vanguard with 1.9bn shares and
    puts Apple's institutional ownership at 70% of the company rather than the
    63.5% it is. Every large holder of every large company has this shape.
  */
  it("lets a restatement replace the filing it amends, not add to it", () => {
    const position = resolveManagerPosition([
      filing({ accession: "0002100119-26-001306" }),
      filing({ accession: "0002100119-26-001311", isRestatement: true }),
    ]);

    expect(position.shares).toBe(953_847_648);
    expect(position.shares).not.toBe(1_907_695_296);
  });

  /*
    Several lines within one filing are legitimate — a manager reports the
    same security separately for each discretion category, or for each
    sub-adviser. Those are different parts of one position and do add up.
  */
  it("adds up ordinary filings that are not restatements", () => {
    const position = resolveManagerPosition([
      filing({ accession: "a", shares: 100, value: 10 }),
      filing({ accession: "b", shares: 250, value: 25 }),
    ]);

    expect(position.shares).toBe(350);
    expect(position.value).toBe(35);
  });

  it("takes the latest of two restatements", () => {
    const position = resolveManagerPosition([
      filing({ accession: "a", shares: 100, isRestatement: true, filedAt: "2026-05-14" }),
      filing({ accession: "b", shares: 400, isRestatement: true, filedAt: "2026-05-20" }),
    ]);

    expect(position.shares).toBe(400);
  });

  it("falls back to the accession number when two restatements share a date", () => {
    const position = resolveManagerPosition([
      filing({ accession: "0001-26-000002", shares: 700, isRestatement: true, filedAt: "2026-05-14" }),
      filing({ accession: "0001-26-000001", shares: 100, isRestatement: true, filedAt: "2026-05-14" }),
    ]);

    expect(position.shares).toBe(700);
  });

  it("ignores the originals entirely once a restatement exists", () => {
    const position = resolveManagerPosition([
      filing({ accession: "a", shares: 100 }),
      filing({ accession: "b", shares: 200 }),
      filing({ accession: "c", shares: 50, isRestatement: true }),
    ]);

    expect(position.shares).toBe(50);
  });

  it("reports nothing for a manager with no filings", () => {
    expect(resolveManagerPosition([])).toEqual({ shares: 0, value: 0 });
  });
});

describe("what counts as a shareholding", () => {
  /*
    A put is a bet the price falls. Counting one as a holding would record a
    position against the company as ownership of it — the exact opposite of
    what happened.
  */
  it("refuses options positions", () => {
    expect(isShareholding({ SSHPRNAMTTYPE: "SH", PUTCALL: "Put" })).toBe(false);
    expect(isShareholding({ SSHPRNAMTTYPE: "SH", PUTCALL: "Call" })).toBe(false);
  });

  /*
    PRN is a principal amount — a bond's face value. Adding it to a share
    count produces a total in no unit at all.
  */
  it("refuses principal amounts, which are not shares", () => {
    expect(isShareholding({ SSHPRNAMTTYPE: "PRN", PUTCALL: "" })).toBe(false);
  });

  it("accepts a plain share position", () => {
    expect(isShareholding({ SSHPRNAMTTYPE: "SH", PUTCALL: "" })).toBe(true);
    expect(isShareholding({ SSHPRNAMTTYPE: "sh", PUTCALL: "  " })).toBe(true);
  });

  it("refuses a row missing the columns that decide it", () => {
    expect(isShareholding({})).toBe(false);
    expect(isShareholding({ PUTCALL: "" })).toBe(false);
  });
});

describe("reading the SEC's dates", () => {
  it("turns 31-MAR-2026 into 2026-03-31", () => {
    expect(normalizeQuarter("31-MAR-2026")).toBe("2026-03-31");
    expect(normalizeQuarter("31-DEC-2025")).toBe("2025-12-31");
    expect(normalizeQuarter("30-jun-2025")).toBe("2025-06-30");
  });

  /*
    Null rather than a guess. A format change upstream should drop rows, not
    write a quarter that nothing will ever query.
  */
  it("refuses anything it does not recognise", () => {
    for (const bad of ["2026-03-31", "31-XXX-2026", "", "31-MAR-26", "garbage"]) {
      expect(normalizeQuarter(bad)).toBeNull();
    }
  });
});

describe("summarising a company's holders", () => {
  const positions = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      cik: String(i),
      name: `Manager ${i}`,
      shares: (i + 1) * 1_000,
      value: (i + 1) * 10_000,
    }));

  it("keeps the largest holders, in order", () => {
    const s = summarisePositions(positions(50), 10);

    expect(s.top).toHaveLength(10);
    expect(s.top[0].shares).toBe(50_000);
    expect(s.top[9].shares).toBe(41_000);
  });

  /*
    Apple had 6,011 filers for Q1 2026 and ten of them are stored. Counting
    after the list is cut would report ten, and "10 institutions hold Apple"
    is a considerably worse claim than no claim at all.
  */
  it("counts every holder, not only the ones it keeps", () => {
    const s = summarisePositions(positions(6_011), 10);

    expect(s.holderCount).toBe(6_011);
    expect(s.top).toHaveLength(10);
  });

  it("totals the shares across every holder, not only the ones it keeps", () => {
    const s = summarisePositions(positions(4), 2);

    expect(s.totalShares).toBe(1_000 + 2_000 + 3_000 + 4_000);
  });

  it("handles a company with fewer holders than the limit", () => {
    const s = summarisePositions(positions(3), 10);

    expect(s.holderCount).toBe(3);
    expect(s.top).toHaveLength(3);
  });

  it("reports nothing for a company nobody filed on", () => {
    const s = summarisePositions([], 10);

    expect(s.holderCount).toBe(0);
    expect(s.totalShares).toBe(0);
    expect(s.top).toEqual([]);
  });
});
