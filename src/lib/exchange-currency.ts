/**
 * The currency a venue trades in.
 *
 * A fallback for when the price provider does not say. Only Yahoo returns a
 * currency with its quotes, and it is opt-in, so without this a Toronto listing
 * would be assumed to trade in US dollars.
 *
 * Exchange rather than country, because the two disagree in the cases that
 * matter: SK hynix is Korean and lists in New York, where it trades in dollars.
 * What a reader needs is the currency they would actually pay in.
 */
const BY_EXCHANGE: Record<string, string> = {
  NYSE: "USD",
  NASDAQ: "USD",
  "NYSE ARCA": "USD",
  NYSEARCA: "USD",
  "NYSE AMERICAN": "USD",
  AMEX: "USD",
  BATS: "USD",
  CBOE: "USD",
  IEX: "USD",
  OTC: "USD",
  US: "USD",

  TSX: "CAD",
  TSXV: "CAD",
  NEO: "CAD",
  CSE: "CAD",

  LSE: "GBP",
  LON: "GBP",

  XETRA: "EUR",
  FSX: "EUR",
  EURONEXT: "EUR",
  AMS: "EUR",
  BRU: "EUR",
  LIS: "EUR",
  MIL: "EUR",
  BME: "EUR",

  SIX: "CHF",
  STO: "SEK",
  OSL: "NOK",
  CPH: "DKK",
  HEL: "EUR",

  TSE: "JPY",
  JPX: "JPY",
  HKEX: "HKD",
  ASX: "AUD",
  NSE: "INR",
  BSE: "INR",
  KRX: "KRW",
  SGX: "SGD",
  TWSE: "TWD",
  SSE: "CNY",
  SZSE: "CNY",
  BOVESPA: "BRL",
  BMV: "MXN",
  JSE: "ZAR",
  TASE: "ILS",
};

/** Returns null for an unrecognised venue, so the caller can decide. */
export function currencyForExchange(exchange?: string | null): string | null {
  if (!exchange) return null;
  return BY_EXCHANGE[exchange.trim().toUpperCase()] ?? null;
}
