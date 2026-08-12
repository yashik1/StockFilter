/** Numeric helpers that propagate "not reported" instead of producing garbage. */

/** Safe division. Returns null when either operand is missing or the divisor is zero. */
export function div(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (numerator == null || denominator == null) return null;
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/** Subtraction that propagates null. */
export function sub(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

/** Addition that propagates null. */
export function add(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return a + b;
}

/** Strict greater-than that returns null when either side is unknown. */
export function gt(a: number | null | undefined, b: number | null | undefined): boolean | null {
  if (a == null || b == null) return null;
  return a > b;
}

/** Rounds to a fixed number of decimal places. */
export function round(value: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Returns the first non-null argument, or null. */
export function coalesce(...values: (number | null | undefined)[]): number | null {
  for (const v of values) if (v != null && Number.isFinite(v)) return v;
  return null;
}
