/**
 * Display sectors, derived from SIC codes.
 *
 * Deliberately separate from `SectorKind` in applicability.ts. That one has four
 * coarse buckets and exists to decide which scoring models are valid — widening
 * it would change what gets suppressed for banks. This one exists only to group
 * companies for a reader, so it uses the familiar market sectors instead.
 *
 * SEC filers carry SIC codes rather than GICS, so these are ranges mapped onto
 * the sector names people recognise. The mapping is approximate by nature; SIC
 * predates several of these industries.
 */
export type DisplaySector =
  | "Technology"
  | "Health Care"
  | "Financials"
  | "Real Estate"
  | "Energy"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Industrials"
  | "Materials"
  | "Utilities"
  | "Communication Services"
  | "Other";

export const DISPLAY_SECTORS: DisplaySector[] = [
  "Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real Estate",
  "Communication Services",
  "Other",
];

/** Specific codes checked before the broader ranges below. */
const EXACT: Record<number, DisplaySector> = {
  3711: "Consumer Discretionary", // motor vehicles
  3713: "Consumer Discretionary",
  3714: "Consumer Discretionary", // motor vehicle parts
  3716: "Consumer Discretionary",
  2911: "Energy", // petroleum refining
  1311: "Energy", // crude petroleum and natural gas
  4813: "Communication Services",
  4832: "Communication Services",
  4833: "Communication Services",
  4841: "Communication Services",
  4899: "Communication Services",
  6798: "Real Estate", // REITs
};

interface Range {
  from: number;
  to: number;
  sector: DisplaySector;
}

/** Checked in order; the first containing range wins. */
const RANGES: Range[] = [
  // Technology — software, computers, semiconductors.
  { from: 7370, to: 7379, sector: "Technology" },
  { from: 3570, to: 3579, sector: "Technology" },
  { from: 3660, to: 3679, sector: "Technology" },
  { from: 3820, to: 3829, sector: "Technology" },
  { from: 3810, to: 3812, sector: "Technology" },

  // Health care — pharma, devices, providers.
  { from: 2830, to: 2836, sector: "Health Care" },
  { from: 3840, to: 3851, sector: "Health Care" },
  { from: 8000, to: 8099, sector: "Health Care" },
  { from: 8731, to: 8734, sector: "Health Care" },

  // Energy — extraction, services, pipelines.
  { from: 1310, to: 1389, sector: "Energy" },
  { from: 2900, to: 2999, sector: "Energy" },
  { from: 4610, to: 4619, sector: "Energy" },

  // Financials before real estate, since the ranges sit adjacent.
  { from: 6000, to: 6499, sector: "Financials" },
  { from: 6700, to: 6799, sector: "Financials" },
  { from: 6500, to: 6599, sector: "Real Estate" },

  { from: 4900, to: 4999, sector: "Utilities" },

  // Communication — telecom, media, entertainment.
  { from: 4800, to: 4899, sector: "Communication Services" },
  { from: 2700, to: 2799, sector: "Communication Services" },
  { from: 7810, to: 7849, sector: "Communication Services" },

  // Consumer staples — food, beverages, tobacco, household, grocery.
  { from: 2000, to: 2199, sector: "Consumer Staples" },
  { from: 2840, to: 2844, sector: "Consumer Staples" },
  { from: 5400, to: 5499, sector: "Consumer Staples" },
  { from: 5140, to: 5149, sector: "Consumer Staples" },

  // Materials — chemicals, metals, paper, packaging.
  { from: 2600, to: 2699, sector: "Materials" },
  { from: 2800, to: 2829, sector: "Materials" },
  { from: 2850, to: 2899, sector: "Materials" },
  { from: 3300, to: 3399, sector: "Materials" },
  { from: 1000, to: 1099, sector: "Materials" },
  { from: 1400, to: 1499, sector: "Materials" },
  { from: 3200, to: 3299, sector: "Materials" },

  // Consumer discretionary — apparel, retail, leisure, autos.
  { from: 2200, to: 2399, sector: "Consumer Discretionary" },
  { from: 3020, to: 3021, sector: "Consumer Discretionary" },
  { from: 3140, to: 3149, sector: "Consumer Discretionary" },
  { from: 5200, to: 5399, sector: "Consumer Discretionary" },
  { from: 5500, to: 5999, sector: "Consumer Discretionary" },
  { from: 7000, to: 7099, sector: "Consumer Discretionary" },
  { from: 7900, to: 7999, sector: "Consumer Discretionary" },
  { from: 5810, to: 5819, sector: "Consumer Discretionary" },

  // Industrials — machinery, aerospace, transport, construction, services.
  { from: 1500, to: 1799, sector: "Industrials" },
  { from: 3400, to: 3569, sector: "Industrials" },
  { from: 3580, to: 3599, sector: "Industrials" },
  { from: 3700, to: 3799, sector: "Industrials" },
  { from: 4000, to: 4599, sector: "Industrials" },
  { from: 4700, to: 4789, sector: "Industrials" },
  { from: 8700, to: 8730, sector: "Industrials" },
  { from: 7300, to: 7369, sector: "Industrials" },
];

/**
 * Maps a SIC code to a readable sector. Returns "Other" when the code is
 * missing or falls outside every range, rather than guessing.
 */
export function displaySectorFromSic(sic: string | number | null | undefined): DisplaySector {
  if (sic == null) return "Other";
  const code = typeof sic === "number" ? sic : Number(String(sic).trim());
  if (!Number.isFinite(code) || code <= 0) return "Other";

  const exact = EXACT[code];
  if (exact) return exact;

  for (const range of RANGES) {
    if (code >= range.from && code <= range.to) return range.sector;
  }
  return "Other";
}
