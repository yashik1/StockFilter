/** Shared types for the scoring engine. */

/** Traffic-light rating shown throughout the UI. */
export type Rating = "good" | "fair" | "poor" | "unknown";

/**
 * One component of a multi-part score.
 * `passed: null` means the component could not be evaluated — the inputs were
 * never reported — which is different from failing it.
 */
export interface Signal {
  key: string;
  label: string;
  passed: boolean | null;
  /** Plain-English description of what this signal tests. */
  detail: string;
}

/** Result of a score that may not apply to every company. */
export interface ScoreResult<T> {
  /** Null when the model does not apply, with `reason` explaining why. */
  value: T | null;
  applicable: boolean;
  /** Why the score is unavailable, shown verbatim in the UI. */
  reason?: string;
}

export interface PiotroskiResult {
  score: number;
  /** Number of signals that could actually be evaluated (normally 9). */
  maxScore: number;
  signals: Signal[];
  rating: Rating;
}

/**
 * Which Altman model was used.
 * - `manufacturing`: the original 1968 five-factor Z, using market value.
 * - `manufacturing-book`: the 1983 Z' revision, which substitutes book equity
 *   for market value when no market capitalisation is available.
 * - `non-manufacturing`: the four-factor Z'' for service and other industries.
 */
export type AltmanVariant = "manufacturing" | "manufacturing-book" | "non-manufacturing";

export interface AltmanResult {
  z: number;
  variant: AltmanVariant;
  zone: "safe" | "grey" | "distress";
  rating: Rating;
}

export interface BeneishResult {
  m: number;
  /** True when M > -1.78, the threshold flagging possible manipulation. */
  flagged: boolean;
  rating: Rating;
}
