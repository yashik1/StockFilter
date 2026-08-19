/**
 * Everything on this app that is not a company.
 *
 * The rest of the app reads SEC filings and scores a business on what it
 * reports. Bitcoin files nothing. Neither does a gold contract, or the December
 * S&P future. They have prices and nothing else, which means half of what this
 * app does simply does not apply to them — and the honest move is to say so
 * rather than render empty score cards that look like data that failed to load.
 *
 * So this module carries three things: what these instruments are, what one
 * unit of their price actually refers to, and enough aliases that somebody
 * typing "bitcoin" or "gold" arrives somewhere useful.
 *
 * Every symbol here is in Yahoo Finance's notation, because Yahoo is the one
 * provider in the stack that covers all of it without a key. Each was checked
 * to return real daily history before being listed — a catalogue entry whose
 * symbol resolves to a price but no bars is worse than no entry, since it
 * charts as an empty box. `npm run instruments:verify` re-checks them.
 */

/**
 * What kind of thing a symbol is.
 *
 * Deliberately a product taxonomy, not a market-structure one. Gold and the
 * E-mini S&P are both futures contracts and a trader would file them together;
 * a reader looking for "commodities" means metal and oil and wheat, and would
 * not think to look for them under the same heading as a stock index. So
 * physical goods are `commodity` and financial contracts are `future`, and the
 * comment exists because the split is a choice rather than a fact.
 */
export type AssetClass = "equity" | "etf" | "crypto" | "commodity" | "future" | "index";

export interface Instrument {
  /** Yahoo Finance notation — the canonical form used in URLs and lookups. */
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Grouping shown on the markets page. */
  category: string;
  /**
   * What one unit of the quoted price buys.
   *
   * Not decoration. A gold quote of 4554 means one troy ounce, while a wheat
   * quote of 695 means one bushel *in cents* — the numbers are meaningless
   * without it, and a reader who assumes dollars per bushel is out by a factor
   * of a hundred.
   */
  unit?: string;
  /** What somebody might type instead of the ticker. */
  aliases?: string[];
}

/**
 * Cryptocurrencies.
 *
 * Trades every day of the year, which matters more than it sounds: the return
 * maths in the backtester works in calendar days rather than trading days, so
 * a crypto curve and an equity curve over the same window are directly
 * comparable without adjustment.
 *
 * Held to coins with real daily history on Yahoo. Several well-known tickers
 * (UNI, APT, SUI, POL, RNDR) return a quote but no bars at all, and a few
 * resolve to prices that do not match the asset — so they are left out rather
 * than shipped as charts that are empty or, worse, quietly wrong.
 */
export const CRYPTO: Instrument[] = [
  { symbol: "BTC-USD", name: "Bitcoin", assetClass: "crypto", category: "Major", aliases: ["bitcoin", "btc", "xbt"] },
  { symbol: "ETH-USD", name: "Ethereum", assetClass: "crypto", category: "Major", aliases: ["ethereum", "ether", "eth"] },
  { symbol: "BNB-USD", name: "BNB", assetClass: "crypto", category: "Major", aliases: ["bnb", "binance coin"] },
  { symbol: "XRP-USD", name: "XRP", assetClass: "crypto", category: "Major", aliases: ["xrp", "ripple"] },
  { symbol: "SOL-USD", name: "Solana", assetClass: "crypto", category: "Smart contract", aliases: ["solana", "sol"] },
  { symbol: "ADA-USD", name: "Cardano", assetClass: "crypto", category: "Smart contract", aliases: ["cardano", "ada"] },
  { symbol: "AVAX-USD", name: "Avalanche", assetClass: "crypto", category: "Smart contract", aliases: ["avalanche", "avax"] },
  { symbol: "TRX-USD", name: "TRON", assetClass: "crypto", category: "Smart contract", aliases: ["tron", "trx"] },
  { symbol: "NEAR-USD", name: "NEAR Protocol", assetClass: "crypto", category: "Smart contract", aliases: ["near"] },
  { symbol: "ICP-USD", name: "Internet Computer", assetClass: "crypto", category: "Smart contract", aliases: ["internet computer", "icp", "dfinity"] },
  { symbol: "ATOM-USD", name: "Cosmos", assetClass: "crypto", category: "Smart contract", aliases: ["cosmos", "atom"] },
  { symbol: "ALGO-USD", name: "Algorand", assetClass: "crypto", category: "Smart contract", aliases: ["algorand", "algo"] },
  { symbol: "SEI-USD", name: "Sei", assetClass: "crypto", category: "Smart contract", aliases: ["sei"] },
  { symbol: "TIA-USD", name: "Celestia", assetClass: "crypto", category: "Smart contract", aliases: ["celestia", "tia"] },
  { symbol: "DOT-USD", name: "Polkadot", assetClass: "crypto", category: "Infrastructure", aliases: ["polkadot", "dot"] },
  { symbol: "LINK-USD", name: "Chainlink", assetClass: "crypto", category: "Infrastructure", aliases: ["chainlink", "link"] },
  { symbol: "FIL-USD", name: "Filecoin", assetClass: "crypto", category: "Infrastructure", aliases: ["filecoin", "fil"] },
  { symbol: "HBAR-USD", name: "Hedera", assetClass: "crypto", category: "Infrastructure", aliases: ["hedera", "hbar"] },
  { symbol: "VET-USD", name: "VeChain", assetClass: "crypto", category: "Infrastructure", aliases: ["vechain", "vet"] },
  { symbol: "INJ-USD", name: "Injective", assetClass: "crypto", category: "Infrastructure", aliases: ["injective", "inj"] },
  { symbol: "OP-USD", name: "Optimism", assetClass: "crypto", category: "Infrastructure", aliases: ["optimism", "op"] },
  { symbol: "LTC-USD", name: "Litecoin", assetClass: "crypto", category: "Payments", aliases: ["litecoin", "ltc"] },
  { symbol: "BCH-USD", name: "Bitcoin Cash", assetClass: "crypto", category: "Payments", aliases: ["bitcoin cash", "bch"] },
  { symbol: "XLM-USD", name: "Stellar", assetClass: "crypto", category: "Payments", aliases: ["stellar", "xlm", "lumens"] },
  { symbol: "ETC-USD", name: "Ethereum Classic", assetClass: "crypto", category: "Payments", aliases: ["ethereum classic", "etc"] },
  { symbol: "AAVE-USD", name: "Aave", assetClass: "crypto", category: "DeFi", aliases: ["aave"] },
  { symbol: "MKR-USD", name: "Maker", assetClass: "crypto", category: "DeFi", aliases: ["maker", "mkr", "makerdao"] },
  { symbol: "DOGE-USD", name: "Dogecoin", assetClass: "crypto", category: "Meme", aliases: ["dogecoin", "doge"] },
  { symbol: "SHIB-USD", name: "Shiba Inu", assetClass: "crypto", category: "Meme", aliases: ["shiba", "shiba inu", "shib"] },
];

/**
 * Physical commodities, quoted as the front-month futures contract.
 *
 * The `unit` on each is load-bearing rather than a nicety. Eleven of these are
 * quoted in **US cents**, not dollars — Yahoo returns the currency as `USX` —
 * so wheat at "695" is $6.95 a bushel and reading it as dollars overstates the
 * price a hundredfold. That is the same failure the app already hit once with
 * won-denominated figures, and the fix is the same: never render a number
 * without its unit attached.
 */
export const COMMODITIES: Instrument[] = [
  { symbol: "GC=F", name: "Gold", assetClass: "commodity", category: "Precious metals", unit: "per troy ounce", aliases: ["gold", "xau"] },
  { symbol: "SI=F", name: "Silver", assetClass: "commodity", category: "Precious metals", unit: "per troy ounce", aliases: ["silver", "xag"] },
  { symbol: "PL=F", name: "Platinum", assetClass: "commodity", category: "Precious metals", unit: "per troy ounce", aliases: ["platinum"] },
  { symbol: "PA=F", name: "Palladium", assetClass: "commodity", category: "Precious metals", unit: "per troy ounce", aliases: ["palladium"] },
  { symbol: "HG=F", name: "Copper", assetClass: "commodity", category: "Industrial metals", unit: "per pound", aliases: ["copper"] },

  { symbol: "CL=F", name: "WTI Crude Oil", assetClass: "commodity", category: "Energy", unit: "per barrel", aliases: ["oil", "crude", "wti", "crude oil"] },
  { symbol: "BZ=F", name: "Brent Crude Oil", assetClass: "commodity", category: "Energy", unit: "per barrel", aliases: ["brent", "brent crude"] },
  { symbol: "NG=F", name: "Natural Gas", assetClass: "commodity", category: "Energy", unit: "per MMBtu", aliases: ["natural gas", "gas", "henry hub"] },
  { symbol: "RB=F", name: "RBOB Gasoline", assetClass: "commodity", category: "Energy", unit: "per gallon", aliases: ["gasoline", "petrol", "rbob"] },
  { symbol: "HO=F", name: "Heating Oil", assetClass: "commodity", category: "Energy", unit: "per gallon", aliases: ["heating oil", "diesel"] },

  { symbol: "ZC=F", name: "Corn", assetClass: "commodity", category: "Grains", unit: "cents per bushel", aliases: ["corn", "maize"] },
  { symbol: "ZW=F", name: "Wheat", assetClass: "commodity", category: "Grains", unit: "cents per bushel", aliases: ["wheat"] },
  { symbol: "ZS=F", name: "Soybeans", assetClass: "commodity", category: "Grains", unit: "cents per bushel", aliases: ["soybeans", "soybean", "soy"] },
  { symbol: "ZM=F", name: "Soybean Meal", assetClass: "commodity", category: "Grains", unit: "per short ton", aliases: ["soybean meal", "soymeal"] },
  { symbol: "ZL=F", name: "Soybean Oil", assetClass: "commodity", category: "Grains", unit: "cents per pound", aliases: ["soybean oil", "soyoil"] },

  { symbol: "KC=F", name: "Coffee", assetClass: "commodity", category: "Softs", unit: "cents per pound", aliases: ["coffee", "arabica"] },
  { symbol: "SB=F", name: "Sugar No. 11", assetClass: "commodity", category: "Softs", unit: "cents per pound", aliases: ["sugar"] },
  { symbol: "CC=F", name: "Cocoa", assetClass: "commodity", category: "Softs", unit: "per metric ton", aliases: ["cocoa", "cacao"] },
  { symbol: "CT=F", name: "Cotton", assetClass: "commodity", category: "Softs", unit: "cents per pound", aliases: ["cotton"] },
  { symbol: "OJ=F", name: "Orange Juice", assetClass: "commodity", category: "Softs", unit: "cents per pound", aliases: ["orange juice", "oj"] },

  { symbol: "LE=F", name: "Live Cattle", assetClass: "commodity", category: "Livestock", unit: "cents per pound", aliases: ["live cattle", "cattle", "beef"] },
  { symbol: "GF=F", name: "Feeder Cattle", assetClass: "commodity", category: "Livestock", unit: "cents per pound", aliases: ["feeder cattle"] },
  { symbol: "HE=F", name: "Lean Hogs", assetClass: "commodity", category: "Livestock", unit: "cents per pound", aliases: ["lean hogs", "hogs", "pork"] },
];

/**
 * Financial futures — stock indices, government bonds, currencies.
 *
 * Worth a warning the equity pages never need: these are leveraged, dated
 * contracts. The continuous price series shown here is stitched from
 * successive front-month contracts, so a long-run chart is a research series
 * rather than something anybody could actually have held. The pages say so.
 */
export const FUTURES: Instrument[] = [
  { symbol: "ES=F", name: "E-mini S&P 500", assetClass: "future", category: "Equity index", unit: "index points", aliases: ["s&p", "sp500", "es", "emini"] },
  { symbol: "NQ=F", name: "E-mini Nasdaq 100", assetClass: "future", category: "Equity index", unit: "index points", aliases: ["nasdaq", "nq"] },
  { symbol: "YM=F", name: "E-mini Dow", assetClass: "future", category: "Equity index", unit: "index points", aliases: ["dow", "dow jones", "ym"] },
  { symbol: "RTY=F", name: "E-mini Russell 2000", assetClass: "future", category: "Equity index", unit: "index points", aliases: ["russell", "russell 2000", "rty"] },
  { symbol: "ZN=F", name: "10-Year T-Note", assetClass: "future", category: "Rates", unit: "per $100 face", aliases: ["10 year", "t-note", "treasury note", "zn"] },
  { symbol: "ZB=F", name: "30-Year T-Bond", assetClass: "future", category: "Rates", unit: "per $100 face", aliases: ["30 year", "t-bond", "treasury bond", "zb"] },
  { symbol: "6E=F", name: "Euro FX", assetClass: "future", category: "Currency", unit: "USD per euro", aliases: ["euro", "eurusd", "eur"] },
];

/** Everything in one list, in the order the markets page shows it. */
export const ALL_INSTRUMENTS: Instrument[] = [...CRYPTO, ...COMMODITIES, ...FUTURES];

const BY_SYMBOL = new Map(ALL_INSTRUMENTS.map((i) => [i.symbol.toUpperCase(), i]));

/** The catalogue entry for a symbol, or null if it is not one of these. */
export function findInstrument(symbol: string): Instrument | null {
  return BY_SYMBOL.get(symbol.trim().toUpperCase()) ?? null;
}

/**
 * What kind of thing a symbol is, without asking a provider.
 *
 * Shape alone is enough for the two notations involved, and answering locally
 * matters: this is called while deciding whether to go and fetch SEC filings,
 * and a network round trip to find out that Bitcoin has no filings would be a
 * round trip spent learning something already knowable.
 *
 * Returns null rather than "equity" for anything unrecognised — absence of a
 * match is not evidence of a stock, and the caller has a provider that can
 * answer properly.
 */
export function classify(symbol: string): AssetClass | null {
  const upper = symbol.trim().toUpperCase();

  const known = BY_SYMBOL.get(upper);
  if (known) return known.assetClass;

  // Yahoo's own notations. Anything ending `=F` is a futures contract, and
  // `-USD` is a crypto pair. Both are unambiguous — no listed equity ticker
  // uses either.
  if (upper.endsWith("=F")) return "future";
  if (/^[A-Z0-9]{2,10}-USD$/.test(upper)) return "crypto";

  return null;
}

/**
 * Whether a symbol is something this app can score.
 *
 * The health report, the screener and the screener backtest all read annual
 * accounts. Nothing in this module files any, so all three are suppressed —
 * not because the data is missing, but because the question does not apply.
 */
export function hasFinancialStatements(symbol: string): boolean {
  return classify(symbol) === null;
}

/** Groups an asset class's instruments by category, preserving list order. */
export function groupByCategory(instruments: Instrument[]): { category: string; items: Instrument[] }[] {
  const groups: { category: string; items: Instrument[] }[] = [];
  for (const item of instruments) {
    const existing = groups.find((g) => g.category === item.category);
    if (existing) existing.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }
  return groups;
}

/**
 * Finds instruments by ticker or plain name.
 *
 * Exists because nobody types "GC=F". They type "gold", and the equity search
 * behind the main box queries a stock directory that has never heard of it, so
 * without this the app looks like it has no commodities at all.
 *
 * Ranked so an exact ticker or name beats a prefix, and a prefix beats a
 * substring — otherwise typing "eth" surfaces Tether before Ethereum.
 */
export function searchInstruments(query: string, limit = 8): Instrument[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { item: Instrument; score: number }[] = [];

  for (const item of ALL_INSTRUMENTS) {
    const symbol = item.symbol.toLowerCase();
    // The bare ticker, without Yahoo's suffix: "btc" rather than "btc-usd".
    const bare = symbol.replace(/-usd$/, "").replace(/=f$/, "");
    const name = item.name.toLowerCase();
    const aliases = item.aliases ?? [];

    let score = 0;
    if (symbol === q || bare === q || name === q || aliases.includes(q)) score = 100;
    else if (aliases.some((a) => a.startsWith(q)) || name.startsWith(q) || bare.startsWith(q)) score = 70;
    else if (name.includes(q) || aliases.some((a) => a.includes(q))) score = 40;

    if (score > 0) scored.push({ item, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.item.symbol.localeCompare(b.item.symbol))
    .slice(0, limit)
    .map((s) => s.item);
}

/** Human label for an asset class, for headings and badges. */
export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity: "Stock",
  etf: "Fund",
  crypto: "Crypto",
  commodity: "Commodity",
  future: "Future",
  index: "Index",
};
