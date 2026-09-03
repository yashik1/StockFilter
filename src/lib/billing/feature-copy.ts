import type { Feature } from "./tiers";

/**
 * Short names for the gated features, for places too narrow to explain.
 *
 * The pricing page writes its own longer lines — "Advanced screener — health,
 * growth, debt and cash-flow filters" — because a reader deciding whether to
 * pay wants the detail. A 288px rail has room for three words, so it gets
 * these instead.
 *
 * Typed as a total Record, so adding a feature to `FEATURES` without naming it
 * here is a compile error rather than a blank line in the interface.
 *
 * This is copy only. *Which* features may be advertised as paid is decided by
 * `FEATURES` and `isSellable` in ./tiers.ts and must never be decided here —
 * a second list of what is sellable is exactly the drift that module's header
 * warns about.
 */
export const FEATURE_LABELS: Readonly<Record<Feature, string>> = {
  BASIC_STOCK_RESEARCH: "Company research",
  BASIC_SCREENER: "Basic screening",
  BACKTESTING: "Backtesting",
  ADVANCED_CHARTS: "Chart overlays",
  PRICE_ALERTS: "Price alerts",
  ADVANCED_SCREENER: "Advanced screener",
  SAVED_SCREENERS: "Saved screens",
  CSV_EXPORT: "CSV export",
  PDF_REPORTS: "Company reports",
  TRADE_JOURNAL: "Trading journal",
  FILING_ALERTS: "Filing alerts",
  PORTFOLIO: "Portfolio tracking",
  PORTFOLIO_ANALYTICS: "Portfolio analysis",
  AI_EXPLANATIONS: "Plain-English explanations",
};
