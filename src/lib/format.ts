/** Display formatting helpers. */

/**
 * Symbols for the currencies a filer is likely to report in.
 *
 * Only two were handled before, and everything else fell through to no symbol
 * at all. SK hynix reports in won, so its revenue rendered as a bare "97.15T" —
 * ninety-seven trillion of nothing in particular — and elsewhere, where the
 * currency was not passed at all, as "$97.15T", which reads as a company larger
 * than every listed company on earth combined. It is ₩97 trillion, or about
 * $70 billion.
 */
const SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
  HKD: "HK$",
  SGD: "S$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  INR: "₹",
  BRL: "R$",
  ZAR: "R",
  CHF: "CHF ",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  MXN: "Mex$",
  TWD: "NT$",
  ILS: "₪",
};

/**
 * How a figure is labelled.
 *
 * A currency with no symbol here keeps its ISO code as a suffix rather than
 * being dropped: "1.2B TWD" is plain, but a number with no unit at all invites
 * the reader to assume dollars, which is the mistake worth preventing.
 */
function label(currency: string): { prefix: string; suffix: string } {
  const code = currency.toUpperCase();
  const symbol = SYMBOLS[code];
  if (symbol) return { prefix: symbol, suffix: "" };
  return { prefix: "", suffix: ` ${code}` };
}

/** Formats a large money figure as $1.23B / €456M / ₩12.3T. */
export function money(value: number | null | undefined, currency = "USD"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const { prefix, suffix } = label(currency);
  const wrap = (n: string) => `${sign}${prefix}${n}${suffix}`;

  if (abs >= 1e12) return wrap(`${(abs / 1e12).toFixed(2)}T`);
  if (abs >= 1e9) return wrap(`${(abs / 1e9).toFixed(2)}B`);
  if (abs >= 1e6) return wrap(`${(abs / 1e6).toFixed(1)}M`);
  if (abs >= 1e3) return wrap(`${(abs / 1e3).toFixed(1)}K`);
  return wrap(abs.toFixed(2));
}

/** Formats a share price with two decimals. */
export function price(value: number | null | undefined, currency = "USD"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const { prefix, suffix } = label(currency);
  return `${prefix}${value.toFixed(2)}${suffix}`;
}

/** Formats a ratio as a percentage. `0.253` becomes `25.3%`. */
export function percent(value: number | null | undefined, places = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(places)}%`;
}

/** Formats a signed percentage for changes. `0.021` becomes `+2.1%`. */
export function signedPercent(value: number | null | undefined, places = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(places)}%`;
}

/** Formats a plain number with a fixed number of decimals. */
export function num(value: number | null | undefined, places = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(places);
}

/** Formats a multiple, e.g. `1.8x`. */
export function multiple(value: number | null | undefined, places = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(places)}x`;
}

/** Compact integer with thousands separators. */
export function count(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
