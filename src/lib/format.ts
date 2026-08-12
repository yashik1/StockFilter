/** Display formatting helpers. */

/** Formats a large money figure as $1.23B / $456M / $12.3K. */
export function money(value: number | null | undefined, currency = "USD"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const prefix = currency === "USD" ? "$" : currency === "CAD" ? "C$" : "";

  if (abs >= 1e12) return `${sign}${prefix}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${prefix}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${prefix}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${prefix}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${prefix}${abs.toFixed(2)}`;
}

/** Formats a share price with two decimals. */
export function price(value: number | null | undefined, currency = "USD"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const prefix = currency === "USD" ? "$" : currency === "CAD" ? "C$" : "";
  return `${prefix}${value.toFixed(2)}`;
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
