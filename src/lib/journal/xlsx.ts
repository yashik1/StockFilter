import type { Sheet } from "./delimited";

/**
 * Reading the first worksheet out of an .xlsx file.
 *
 * An .xlsx is a ZIP holding a handful of XML parts, so this needs no library:
 * find the two entries that matter, inflate them, and read the cells. That is
 * worth doing by hand here rather than taking a dependency — the spreadsheet
 * libraries are large, they parse far more of the format than an import needs,
 * and every one of them is a lot of code to trust with a file somebody
 * uploaded.
 *
 * Deliberately partial, and honest about it. It reads values and shared
 * strings from the first sheet. It does not evaluate formulas — it reads the
 * cached result the spreadsheet stored, which is what you want for an export
 * — and it does not attempt styles, dates-as-serial-numbers beyond the common
 * case, or anything about a second sheet. Anything it cannot read says so and
 * points at CSV rather than guessing.
 */

/** Inflate is only needed for deflated entries; stored entries are copied. */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  // DecompressionStream is in every current browser and in Node 18+. There is
  // no fallback worth writing: a hand-rolled inflate is several hundred lines
  // to reimplement something already present everywhere this runs.
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntry {
  name: string;
  compression: number;
  data: Uint8Array;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

/**
 * Reads the ZIP central directory, then the local entries it points at.
 *
 * The central directory is used rather than walking local headers from the
 * front, because a local header may carry a data descriptor instead of the
 * sizes — in which case the compressed length is not knowable until after the
 * data, and a forward walk cannot find the next entry.
 */
async function readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // The end-of-central-directory record sits in the last 64KB, after a
  // comment of unknown length, so it is found by scanning backwards.
  let end = -1;
  const from = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= from; i--) {
    if (view.getUint32(i, true) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not-a-zip");

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== SIG_CENTRAL) break;

    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);

    const name = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );

    // The local header repeats the name and extra fields, and its extra
    // length often differs from the central one — so the data offset has to
    // be computed from the local header rather than assumed.
    if (view.getUint32(localOffset, true) === SIG_LOCAL) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      entries.push({
        name,
        compression,
        data: bytes.subarray(start, start + compressedSize),
      });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  const out = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.compression === 0) out.set(entry.name, entry.data);
    else if (entry.compression === 8) out.set(entry.name, await inflateRaw(entry.data));
    // Anything else is a compression method no spreadsheet writes; skipped
    // rather than guessed at.
  }
  return out;
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes as BufferSource);

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // Ampersand last, or an &amp;lt; would round-trip into a real "<".
    .replace(/&amp;/g, "&");
}

/** Every `<t>` run in the shared string table, in order. */
function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  // A shared string may be several runs (`<r><t>a</t></r><r><t>b</t></r>`)
  // when part of it is styled, so each <si> is joined rather than taking the
  // first <t> — otherwise "AAPL long" arrives as "AAPL".
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    const runs = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    out.push(
      runs
        .map((t) => unescapeXml(t.replace(/^<t\b[^>]*>/, "").replace(/<\/t>$/, "")))
        .join(""),
    );
  }
  return out;
}

/** "BC12" -> 54. Column letters are base-26 with no zero. */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Excel stores a date as a day count, and a cell carrying one looks exactly
 * like a number — so a date column can arrive as "45658" and has to be
 * recognised rather than handed to a date parser.
 *
 * The offset is 25569 days between Excel's epoch and Unix's, which is right
 * for every date from 1900-03-01 onwards. Before that it is out by one,
 * because Excel believes 1900 was a leap year: serial 60 is 1900-02-29, a day
 * that never happened, deliberately kept by Microsoft for compatibility with
 * Lotus 1-2-3 and never fixed. So serials below 60 need the extra day back,
 * and serial 60 itself is not a date at all.
 *
 * None of which will ever appear in a trade journal. It is four lines to be
 * correct rather than approximately correct, and a function that silently
 * returns the wrong day for some inputs is worse than one that does not.
 */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  // The day Excel invented. It has no real date to convert to.
  if (Math.floor(serial) === 60) return null;

  const offset = serial < 60 ? 25_568 : 25_569;
  const ms = Math.round((serial - offset) * 86_400_000);
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function cellText(cell: string, shared: string[]): string {
  const type = cell.match(/\bt="([^"]+)"/)?.[1];

  if (type === "inlineStr") {
    const runs = cell.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
    return runs
      .map((t) => unescapeXml(t.replace(/^<t\b[^>]*>/, "").replace(/<\/t>$/, "")))
      .join("");
  }

  // `<v>` is the value; for a formula cell it is the cached result, which is
  // what an export is meant to carry.
  const raw = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (raw == null) return "";
  const value = unescapeXml(raw);

  if (type === "s") {
    const index = Number(value);
    return shared[index] ?? "";
  }
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  return value;
}

/**
 * Reads the first worksheet as though it were a CSV.
 *
 * Returns the same shape the delimited reader does, so everything downstream
 * — detection, mapping, preview, validation — is identical whether the file
 * was a spreadsheet or a text export.
 */
export async function readXlsx(buffer: ArrayBuffer): Promise<Sheet> {
  const files = await readZip(buffer);

  const sharedPart = files.get("xl/sharedStrings.xml");
  const shared = sharedPart ? readSharedStrings(decode(sharedPart)) : [];

  // Worksheets are conventionally sheet1.xml, but the name is only a
  // convention — so fall back to the first worksheet part present.
  const sheetName =
    ["xl/worksheets/sheet1.xml"].find((n) => files.has(n)) ??
    [...files.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0];

  const sheetPart = sheetName ? files.get(sheetName) : undefined;
  if (!sheetPart) throw new Error("no-worksheet");

  const xml = decode(sheetPart);
  const grid: string[][] = [];

  for (const rowXml of xml.match(/<row\b[\s\S]*?(?:\/>|<\/row>)/g) ?? []) {
    const cells: string[] = [];
    for (const cellXml of rowXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = cellXml.match(/\br="([A-Z]+)\d+"/)?.[1];
      // An empty cell is simply absent from the XML, so the reference is what
      // keeps later columns from sliding left into the gap.
      const index = ref ? columnIndex(ref) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = cellText(cellXml, shared).trim();
    }
    grid.push(cells);
  }

  const usable = grid.filter((r) => r.some((c) => c !== ""));
  if (usable.length === 0) return { headers: [], rows: [], delimiter: "xlsx" };

  const seen = new Map<string, number>();
  const headers = usable[0].map((h, i) => {
    const name = h.trim() || `Column ${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });

  const rows = usable.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });

  return { headers, rows, delimiter: "xlsx" };
}

/** Whether this environment can inflate at all, so the UI can say so up front. */
export function canReadXlsx(): boolean {
  return typeof DecompressionStream !== "undefined";
}
