/**
 * The screening universe.
 *
 * A worldwide screener cannot scan every ticker live, so scores are precomputed
 * nightly for this list and the screener queries only the database.
 *
 * Canadian coverage works because these companies cross-list on NYSE/NASDAQ and
 * file 40-F with the SEC under the MJDS regime, which puts their financials in
 * EDGAR alongside US filers. TSX-only names have no free equivalent (SEDAR+ has
 * no public API) and arrive with the EODHD upgrade.
 *
 * Edit these lists to change what the screener covers.
 */

/** US large and mid caps: S&P 500 and NASDAQ 100 constituents. */
export const US_SYMBOLS: string[] = [
  // Technology
  "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "AMD", "ADBE", "CSCO", "ACN",
  "INTU", "IBM", "QCOM", "TXN", "NOW", "AMAT", "ADI", "MU", "LRCX", "KLAC",
  "SNPS", "CDNS", "PANW", "ANET", "ROP", "APH", "MSI", "FTNT", "NXPI", "MCHP",
  "TEL", "GLW", "HPQ", "HPE", "DELL", "WDC", "STX", "NTAP", "SWKS", "MPWR",
  "TER", "ZBRA", "KEYS", "TYL", "PTC", "CDW", "GDDY", "AKAM",
  "FFIV", "EPAM", "IT", "CTSH", "INFY", "WIT", "SMCI", "ON", "ENPH", "SEDG",
  "CRWD", "DDOG", "ZS", "SNOW", "MDB", "TEAM", "WDAY", "VEEV", "HUBS", "NET",
  "OKTA", "TWLO", "DOCU", "ZM", "XYZ", "SHOP", "SPOT", "UBER", "LYFT", "ABNB",
  "DASH", "PLTR", "RBLX", "U", "PATH", "AI", "COIN", "HOOD", "SOFI", "AFRM",

  // Communication services
  "GOOGL", "GOOG", "META", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS", "CHTR",
  "EA", "TTWO", "WBD", "PSKY", "OMC", "LYV", "MTCH", "PINS", "SNAP",

  // Consumer discretionary
  "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "ORLY",
  "AZO", "ROST", "YUM", "CMG", "MAR", "HLT", "GM", "F", "RIVN", "LCID",
  "APTV", "BWA", "LEA", "DHI", "LEN", "PHM", "NVR", "TOL", "WHR", "MHK",
  "EBAY", "ETSY", "W", "CHWY", "LULU", "DECK", "CROX", "VFC", "PVH",
  "RL", "TPR", "CPRI", "GAP", "ANF", "AEO", "URBN", "BBY", "DG", "DLTR",
  "KMX", "AN", "LAD", "GPC", "AAP", "TSCO", "WSM", "RH", "FND", "POOL",

  // Consumer staples
  "WMT", "COST", "PG", "KO", "PEP", "PM", "MO", "MDLZ", "CL", "KMB",
  "GIS", "HSY", "SJM", "CPB", "CAG", "HRL", "TSN", "KHC", "STZ",
  "BF.B", "TAP", "MNST", "KDP", "CELH", "KR", "SYY", "ADM", "BG", "CHD",
  "CLX", "EL", "COTY", "DLTR", "TGT", "DG",

  // Health care
  "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "DHR", "PFE", "AMGN",
  "BMY", "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ISRG", "SYK", "BSX", "MDT",
  "EW", "ZBH", "BAX", "BDX", "RMD", "DXCM", "PODD", "ALGN", "IDXX",
  "CI", "ELV", "CVS", "HUM", "CNC", "MOH", "HCA", "UHS", "THC", "DVA",
  "MCK", "COR", "CAH", "ZTS", "IQV", "A", "MTD", "WAT", "RVTY", "TECH",
  "CRL", "LH", "DGX", "VTRS", "OGN", "JAZZ", "INCY", "NBIX", "ALNY",

  // Financials
  "BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "SPGI", "BLK",
  "AXP", "C", "SCHW", "CB", "MRSH", "PGR", "AON", "ICE", "CME", "MCO",
  "PNC", "USB", "TFC", "COF", "BNY", "STT", "NTRS", "FITB", "HBAN", "RF",
  "CFG", "KEY", "MTB", "ZION", "ALL", "TRV", "AIG", "MET", "PRU",
  "AFL", "HIG", "PFG", "LNC", "GL", "AJG", "BRO", "WTW", "ACGL", "EG",
  "AMP", "TROW", "BEN", "IVZ", "NDAQ", "CBOE", "MKTX", "FDS", "MSCI", "PYPL",
  "FISV", "FIS", "GPN", "SYF", "ALLY",

  // Industrials
  "GE", "CAT", "RTX", "HON", "UNP", "BA", "LMT", "DE", "UPS", "ADP",
  "ETN", "ITW", "EMR", "NOC", "GD", "CSX", "NSC", "FDX", "WM", "RSG",
  "PH", "CMI", "PCAR", "ROK", "AME", "DOV", "IR", "XYL", "FTV", "OTIS",
  "CARR", "JCI", "TT", "LII", "MAS", "AOS", "SWK", "SNA", "FAST", "GWW",
  "URI", "PWR", "EME", "J", "ACM", "MTZ", "HUBB", "NDSN", "GGG", "IEX",
  "LHX", "TDG", "HWM", "TXT", "HEI", "AXON", "LDOS", "BAH", "CACI", "SAIC",
  "DAL", "UAL", "AAL", "LUV", "ALK", "CHRW", "EXPD", "ODFL", "SAIA", "XPO",

  // Energy
  "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "OXY", "WMB",
  "KMI", "OKE", "DVN", "FANG", "HAL", "BKR", "TRGP", "EQT",
  "APA", "PR", "AR", "RRC", "EXE", "MUR", "NOV", "FTI",

  // Utilities
  "NEE", "SO", "DUK", "SRE", "D", "EXC", "XEL", "ED", "PEG",
  "WEC", "ES", "AWK", "DTE", "PPL", "FE", "AEE", "CMS", "CNP", "NI",
  "LNT", "EVRG", "ATO", "PNW", "NRG", "VST", "CEG", "AES",

  // Real estate
  "PLD", "AMT", "EQIX", "CCI", "PSA", "SPG", "O", "WELL", "DLR", "VICI",
  "AVB", "EQR", "INVH", "MAA", "ESS", "UDR", "CPT", "ARE", "BXP", "KIM",
  "REG", "FRT", "HST", "IRM", "EXR", "CUBE", "WY", "SBAC",

  // Materials
  "LIN", "SHW", "APD", "ECL", "FCX", "NEM", "NUE", "STLD", "CLF",
  "DOW", "DD", "LYB", "PPG", "IFF", "ALB", "CE", "EMN", "MOS", "CF",
  "VMC", "MLM", "PKG", "IP", "AMCR", "AVY", "BALL",
];

/**
 * Canadian companies cross-listed on US exchanges.
 *
 * All of these file with the SEC (40-F or 10-K), so their fundamentals are
 * available through EDGAR at no cost. Most report under `ifrs-full`, which is
 * why the normalizer maps both taxonomies.
 */
export const CANADIAN_SYMBOLS: string[] = [
  // Banks and financials
  "RY", "TD", "BNS", "BMO", "CM", "MFC", "SLF", "IVZ",
  // Energy and pipelines
  "ENB", "TRP", "SU", "CNQ", "IMO", "OVV", "CVE", "PBA", "VET", "BTE",
  // Materials and mining
  "ABX", "AEM", "WPM", "FNV", "KGC", "IAG", "TECK", "CCJ",
  // Industrials and transport
  "CP", "CNI", "WCN", "TRI", "BIP", "BEP", "BAM", "BN",
  // Technology and consumer
  "SHOP", "LULU", "OTEX", "CLS", "QSR", "DOO", "MG", "GIL", "NTR",
  "AQN", "CPXXY", "FTS", "EMA", "H", "TAC",
];

/** The full nightly ingest universe. */
export function getUniverse(): string[] {
  return [...new Set([...US_SYMBOLS, ...CANADIAN_SYMBOLS])].sort();
}

export function isCanadian(symbol: string): boolean {
  return CANADIAN_SYMBOLS.includes(symbol.toUpperCase());
}
