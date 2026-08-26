import type { Side } from "./trade-math";
import { excelSerialToDate } from "./xlsx";

/**
 * Turning somebody's spreadsheet into trades.
 *
 * Two jobs, kept apart on purpose. Guessing which column is which is a
 * convenience and is allowed to be wrong — the reader sees the guess and can
 * correct it before anything is written. Turning a mapped row into a trade is
 * not allowed to be wrong: a row it cannot read with confidence is reported
 * and skipped rather than imported with a plausible substitute, because a
 * journal that quietly invents an entry price is worse than one with a gap.
 */

/** Every field an imported row can fill. */
export const FIELDS = [
  "symbol", "side", "quantity", "entryPrice", "exitPrice",
  "stopPrice", "targetPrice", "fees", "openedAt", "closedAt", "notes",
] as const;

export type Field = (typeof FIELDS)[number];

export const REQUIRED: Field[] = ["symbol", "quantity", "entryPrice"];

export const FIELD_LABEL: Record<Field, string> = {
  symbol: "Symbol",
  side: "Direction",
  quantity: "Size",
  entryPrice: "Entry price",
  exitPrice: "Exit price",
  stopPrice: "Stop",
  targetPrice: "Target",
  fees: "Fees",
  openedAt: "Opened",
  closedAt: "Closed",
  notes: "Notes",
};

export type Mapping = Partial<Record<Field, string>>;

/**
 * What each field's column tends to be called.
 *
 * Ordered most specific first, because the loose patterns overlap: a column
 * called "Entry Price" must not be claimed by the bare "price" pattern that
 * exists to catch exports with only one price column. Matching is done on a
 * squashed lower-case form, so "Entry Price", "entry_price" and "EntryPrice"
 * are the same string by the time they are compared.
 */
const PATTERNS: Record<Field, string[]> = {
  symbol: ["symbol", "ticker", "instrument", "security", "asset", "market", "stock", "contract"],
  side: ["side", "direction", "action", "buysell", "longshort", "type", "position"],
  quantity: ["quantity", "qty", "shares", "size", "units", "volume", "amount", "filledqty", "contracts"],
  entryPrice: [
    "entryprice", "entry", "openprice", "buyprice", "avgentryprice", "avgfillprice",
    "openrate", "priceopen", "fillprice", "avgprice", "price",
  ],
  exitPrice: [
    "exitprice", "exit", "closeprice", "sellprice", "avgexitprice",
    "closerate", "priceclose", "closingprice",
  ],
  stopPrice: ["stoploss", "stopprice", "stop", "sl"],
  targetPrice: ["takeprofit", "targetprice", "target", "tp", "profittarget", "limit"],
  fees: ["commission", "fees", "fee", "cost", "charges", "commissions", "swap"],
  openedAt: [
    "opendate", "entrydate", "entrytime", "opentime", "datetimeopened", "openedat",
    "purchasedate", "boughtdate", "tradedate", "date", "datetime", "time",
  ],
  closedAt: ["closedate", "exitdate", "exittime", "closetime", "datetimeclosed", "closedat", "solddate"],
  notes: ["notes", "note", "comment", "comments", "description", "reason", "setup", "remarks"],
};

/** "Avg. Entry Price" -> "avgentryprice" */
function squash(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Guesses a column for each field.
 *
 * An exact match beats a contained one, and each column is claimed once —
 * without that, a file with "Open Date" and "Close Date" would map both to
 * `openedAt`, since "date" appears in each.
 */
export function detectColumns(headers: string[]): Mapping {
  const squashed = headers.map(squash);
  const taken = new Set<string>();
  const mapping: Mapping = {};

  // Two passes: exact matches first across every field, so a loose pattern
  // cannot take a column that some other field names precisely.
  for (const exactOnly of [true, false]) {
    for (const field of FIELDS) {
      if (mapping[field]) continue;

      for (const pattern of PATTERNS[field]) {
        const index = squashed.findIndex(
          (h, i) =>
            !taken.has(headers[i]) &&
            (exactOnly ? h === pattern : h.includes(pattern)),
        );
        if (index >= 0) {
          mapping[field] = headers[index];
          taken.add(headers[index]);
          break;
        }
      }
    }
  }

  return mapping;
}

/** A row that survived validation, ready to insert. */
export interface TradeDraft {
  symbol: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  fees: number;
  openedAt: string;
  closedAt: string | null;
  notes: string;
}

export interface RowProblem {
  /** 1-based, counting the header as row 1, so it matches the spreadsheet. */
  line: number;
  reason: string;
}

export interface ImportPreview {
  drafts: TradeDraft[];
  problems: RowProblem[];
  /** Fields with no column chosen, so the UI can say what will be missing. */
  missingRequired: Field[];
}

/**
 * Reads a number written by any locale or broker.
 *
 * Handles thousands separators, currency symbols, parentheses for negatives,
 * and the European decimal comma. The comma is the awkward one: "1,50" is one
 * and a half in most of Europe and one hundred and fifty elsewhere, so it is
 * read as a decimal point only when the pattern cannot be a thousands group —
 * exactly one comma, with one or two digits after it and no full stop
 * anywhere.
 */
export function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  let body = text.replace(/^\(|\)$/g, "").replace(/[^0-9.,]/g, "");
  if (!body) return null;

  const commas = (body.match(/,/g) ?? []).length;
  const dots = (body.match(/\./g) ?? []).length;

  if (commas > 0 && dots === 0) {
    const afterLast = body.length - body.lastIndexOf(",") - 1;
    if (commas === 1 && (afterLast === 1 || afterLast === 2)) body = body.replace(",", ".");
    else body = body.replace(/,/g, "");
  } else {
    body = body.replace(/,/g, "");
  }

  const n = Number(body);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/**
 * Reads a date without guessing between the two ways the world writes them.
 *
 * ISO is taken as-is. A slashed or dotted date is ambiguous — 03/04/2026 is
 * two different days depending on where the file came from — so it is read as
 * day-first only when the first number cannot be a month. Anything still
 * ambiguous is handed to Date, whose behaviour is at least documented, and a
 * row whose date cannot be read at all is reported rather than dropped onto
 * today.
 */
export function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  /*
    A spreadsheet stores a date as a day count, so a date column exported from
    one arrives as "45658" with nothing to mark it as a date. Handing that to
    Date.parse yields the year 45658, and the row imports without complaint —
    the exact shape of silent corruption this whole module exists to avoid.

    The range is deliberately narrow: 20000 is 1954 and 60000 is 2064, which
    covers any date a trade could carry while staying clear of a bare year
    like "2026" written into a date column, which Date.parse handles correctly
    on its own.
  */
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20_000 && serial <= 60_000) return excelSerialToDate(serial);
  }

  const parts = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (parts) {
    const [, a, b, y] = parts;
    let year = Number(y);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    // Only reorder when the first number is impossible as a month.
    const first = Number(a);
    const second = Number(b);
    let month: number;
    let day: number;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    const date = new Date(parsed);
    // Date.parse is permissive to a fault and will happily return the year
    // 45658. A trade dated outside this range is a misread column, not a
    // trade, and reporting the row beats importing a date nobody meant.
    const year = date.getUTCFullYear();
    if (year >= 1900 && year <= 2100) return date.toISOString().slice(0, 10);
  }
  return null;
}

/** Long unless the cell plainly says otherwise. */
export function parseSide(raw: string): Side {
  const text = raw.trim().toLowerCase();
  if (/\b(short|sell|sld|s|sale)\b/.test(text) || text === "-1") return "short";
  return "long";
}

const MAX_ROWS = 2_000;

/**
 * Applies a mapping to every row and reports what came of it.
 *
 * Nothing is written here — this produces the preview the reader confirms.
 * The rule throughout is that a row is either read confidently or reported:
 * a missing optional field becomes null, and an unreadable required one takes
 * the row out with a reason attached to its line number.
 */
export function buildPreview(
  rows: Record<string, string>[],
  mapping: Mapping,
): ImportPreview {
  const missingRequired = REQUIRED.filter((f) => !mapping[f]);
  if (missingRequired.length > 0) {
    return { drafts: [], problems: [], missingRequired };
  }

  const drafts: TradeDraft[] = [];
  const problems: RowProblem[] = [];
  const cell = (row: Record<string, string>, field: Field): string =>
    mapping[field] ? (row[mapping[field]!] ?? "") : "";

  rows.slice(0, MAX_ROWS).forEach((row, i) => {
    // +2: the header is line 1, and rows are 0-based here.
    const line = i + 2;

    const symbol = cell(row, "symbol").trim().toUpperCase().slice(0, 20);
    if (!symbol) {
      problems.push({ line, reason: "No symbol" });
      return;
    }

    const quantity = parseNumber(cell(row, "quantity"));
    if (quantity == null || quantity <= 0) {
      problems.push({ line, reason: `Size is not a positive number (${cell(row, "quantity") || "empty"})` });
      return;
    }

    const entryPrice = parseNumber(cell(row, "entryPrice"));
    if (entryPrice == null || entryPrice <= 0) {
      problems.push({ line, reason: `Entry price is not a positive number (${cell(row, "entryPrice") || "empty"})` });
      return;
    }

    const openedRaw = cell(row, "openedAt");
    const openedAt = openedRaw ? parseDate(openedRaw) : new Date().toISOString().slice(0, 10);
    if (!openedAt) {
      problems.push({ line, reason: `Could not read the opening date (${openedRaw})` });
      return;
    }

    const exitPrice = parseNumber(cell(row, "exitPrice"));
    const closedRaw = cell(row, "closedAt");
    let closedAt = closedRaw ? parseDate(closedRaw) : null;

    /*
      A price and a date have to agree, because every realised figure keys off
      both. An exit with no date is dated the open, which is the safe reading
      for a same-day export; a date with no price means the position is open
      and the date was a stray column.
    */
    if (exitPrice != null && exitPrice > 0 && !closedAt) closedAt = openedAt;
    if (exitPrice == null || exitPrice <= 0) closedAt = null;

    if (closedAt && closedAt < openedAt) {
      problems.push({ line, reason: "Closes before it opens" });
      return;
    }

    const positive = (f: Field): number | null => {
      const n = parseNumber(cell(row, f));
      return n != null && n > 0 ? n : null;
    };

    drafts.push({
      symbol,
      side: parseSide(cell(row, "side")),
      quantity,
      entryPrice,
      exitPrice: exitPrice != null && exitPrice > 0 ? exitPrice : null,
      stopPrice: positive("stopPrice"),
      targetPrice: positive("targetPrice"),
      // A commission is a cost however the export signs it.
      fees: Math.abs(parseNumber(cell(row, "fees")) ?? 0),
      openedAt,
      closedAt,
      notes: cell(row, "notes").slice(0, 2_000),
    });
  });

  if (rows.length > MAX_ROWS) {
    problems.push({
      line: MAX_ROWS + 2,
      reason: `Only the first ${MAX_ROWS} rows were read. Split the file and import the rest separately.`,
    });
  }

  return { drafts, problems, missingRequired: [] };
}
