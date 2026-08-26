/**
 * Reading a CSV the way brokers actually export them.
 *
 * `text.split(",")` is the version everybody writes first, and it breaks on
 * the first row that matters: a notes column containing a comma, a European
 * export using semicolons, a decimal comma, a quoted field with a line break
 * inside it. Any of those silently shifts every column one to the left, which
 * is worse than refusing the file — the import would appear to work and put
 * exit prices in the stop column.
 *
 * So this is a real RFC 4180 reader, plus the two deviations that show up in
 * practice: a leading byte-order mark, and delimiters that are not commas.
 */

export interface Sheet {
  headers: string[];
  /** One entry per row, keyed by header. Short rows are padded with "". */
  rows: Record<string, string>[];
  /** What the delimiter turned out to be, for reporting back. */
  delimiter: string;
}

/** Guessed from the header line, where the count is most reliable. */
const CANDIDATES = [",", ";", "\t", "|"] as const;

/**
 * Picks the delimiter by counting occurrences outside quotes on the first
 * line. Semicolons are common wherever the decimal separator is a comma, and
 * a tab export is what you get from a copy-and-paste out of a spreadsheet.
 */
export function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, 10_000).split(/\r?\n/)[0] ?? "";

  let best = ",";
  let bestCount = 0;
  for (const candidate of CANDIDATES) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === candidate) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Splits the whole text into rows of fields.
 *
 * Walks character by character rather than splitting on newlines first,
 * because a quoted field may contain one — and a row-then-field split cannot
 * recover from that.
 */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is an escaped quote, not the
        // end of it — the one rule that separates a real reader from a naive
        // one on any file containing 5" or an inch mark.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (ch === "\r") {
      // Swallowed: the newline that follows ends the row.
    } else {
      field += ch;
    }
  }

  // Whatever is left when the text runs out is still a row, unless the file
  // simply ended with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Makes headers usable, and unique, without discarding what they said. */
function normaliseHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const name = h.trim() || `Column ${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    // Two columns called "Price" is common in broker exports — one for the
    // open and one for the close. Suffixing keeps both reachable rather than
    // letting the second quietly overwrite the first.
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

export function parseDelimited(text: string, delimiter?: string): Sheet {
  // A UTF-8 BOM makes the first header "﻿Symbol", which then matches
  // nothing. Excel writes one by default.
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? sniffDelimiter(clean);

  const raw = splitRows(clean, sep).filter(
    // A row of nothing but empty fields is a blank line, not a record.
    (r) => r.some((f) => f.trim() !== ""),
  );

  if (raw.length === 0) return { headers: [], rows: [], delimiter: sep };

  const headers = normaliseHeaders(raw[0]);
  const rows = raw.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });

  return { headers, rows, delimiter: sep };
}
