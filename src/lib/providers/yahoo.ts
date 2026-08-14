import type {
  CanonicalField,
  Fact,
  FinancialPeriod,
  NormalizedFundamentals,
} from "../fundamentals/types";
import type { Bar, Quote, Timeframe } from "./types";

/**
 * Yahoo Finance — the widest free coverage, and off unless explicitly enabled.
 *
 * WHY THIS IS OPT-IN
 *
 * Yahoo has published no finance API since shutting the old one down in 2017.
 * These are internal endpoints behind the website. Their terms prohibit
 * automated access and republishing, and the data is described as personal-use
 * only. Personal research carries little practical risk; a public, deployed
 * product carries meaningfully more. That is a judgement about your own
 * exposure, not a technical question, so nothing here runs unless
 * ENABLE_YAHOO_FALLBACK is set to "true".
 *
 * Only endpoints that answer directly are used. Yahoo's `quoteSummary` replies
 * with a crumb challenge — a bot-protection mechanism — and defeating that is
 * off the table, so the modules behind it are simply not available here.
 *
 * Being undocumented, these endpoints can change shape or disappear without
 * notice. Every call therefore fails soft: the app falls back to whatever else
 * is configured rather than breaking.
 */

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const TIMESERIES =
  "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries";

/** Yahoo rejects requests with no browser-like User-Agent. */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const INTERVALS: Record<Timeframe, string> = {
  "1Min": "1m",
  "5Min": "5m",
  "15Min": "15m",
  "1Hour": "1h",
  "1Day": "1d",
  "1Week": "1wk",
};

/** Annual series names, mapped onto our canonical fields. */
const SERIES: Partial<Record<CanonicalField, string>> = {
  assets: "annualTotalAssets",
  liabilities: "annualTotalLiabilitiesNetMinorityInterest",
  equity: "annualStockholdersEquity",
  currentAssets: "annualCurrentAssets",
  currentLiabilities: "annualCurrentLiabilities",
  cash: "annualCashAndCashEquivalents",
  receivables: "annualAccountsReceivable",
  inventory: "annualInventory",
  ppe: "annualNetPPE",
  longTermDebt: "annualLongTermDebt",
  shortTermDebt: "annualCurrentDebt",
  retainedEarnings: "annualRetainedEarnings",
  revenue: "annualTotalRevenue",
  costOfRevenue: "annualCostOfRevenue",
  grossProfit: "annualGrossProfit",
  operatingIncome: "annualOperatingIncome",
  netIncome: "annualNetIncome",
  incomeBeforeTax: "annualPretaxIncome",
  interestExpense: "annualInterestExpense",
  sga: "annualSellingGeneralAndAdministration",
  depreciation: "annualReconciledDepreciation",
  operatingCashFlow: "annualOperatingCashFlow",
  capex: "annualCapitalExpenditure",
  sharesOutstanding: "annualOrdinarySharesNumber",
};

/**
 * Exchange codes mapped to Yahoo's ticker suffixes.
 *
 * Yahoo keys every non-US listing by suffix — Aritzia is ATZ.TO, not ATZ, and
 * the bare ticker returns nothing at all. The worldwide directory names the
 * exchange, so the suffix can be derived rather than guessed.
 */
const EXCHANGE_SUFFIX: Record<string, string> = {
  TSX: ".TO",
  TSXV: ".V",
  NEO: ".NE",
  CSE: ".CN",
  LSE: ".L",
  LON: ".L",
  FSX: ".F",
  XETRA: ".DE",
  EURONEXT: ".PA",
  AMS: ".AS",
  BRU: ".BR",
  LIS: ".LS",
  MIL: ".MI",
  BME: ".MC",
  SIX: ".SW",
  STO: ".ST",
  OSL: ".OL",
  CPH: ".CO",
  HEL: ".HE",
  TSE: ".T",
  JPX: ".T",
  HKEX: ".HK",
  ASX: ".AX",
  NSE: ".NS",
  BSE: ".BO",
  KRX: ".KS",
  SGX: ".SI",
  TWSE: ".TW",
  SSE: ".SS",
  SZSE: ".SZ",
  Bovespa: ".SA",
  BMV: ".MX",
  JSE: ".JO",
  TASE: ".TA",
};

/**
 * Builds the symbol Yahoo expects for a listing on a given exchange.
 *
 * US venues take the bare ticker; everything else needs its suffix. An
 * unrecognised exchange falls back to the bare ticker rather than inventing a
 * suffix, since a wrong one silently returns another company's data.
 */
export function yahooSymbol(symbol: string, exchange?: string | null): string {
  const upper = symbol.toUpperCase();
  if (upper.includes(".")) return upper;
  if (!exchange) return upper;

  const key = exchange.trim().toUpperCase();
  const US = new Set(["NYSE", "NASDAQ", "NYSE ARCA", "AMEX", "BATS", "OTC", "US"]);
  if (US.has(key)) return upper;

  const direct = EXCHANGE_SUFFIX[key];
  if (direct) return `${upper}${direct}`;

  // Keys are compared case-insensitively so "Bovespa" matches too.
  const match = Object.entries(EXCHANGE_SUFFIX).find(
    ([code]) => code.toUpperCase() === key,
  );
  return match ? `${upper}${match[1]}` : upper;
}

export class YahooProvider {
  readonly name = "Yahoo Finance";

  /** Deliberately requires an explicit opt-in rather than merely a key. */
  isConfigured(): boolean {
    return process.env.ENABLE_YAHOO_FALLBACK === "true";
  }

  async getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]> {
    if (!this.isConfigured()) return [];

    const params = new URLSearchParams({
      interval: INTERVALS[timeframe],
      period1: String(Math.floor(from.getTime() / 1000)),
      period2: String(Math.floor(to.getTime() / 1000)),
    });

    try {
      const res = await fetch(`${CHART}/${encodeURIComponent(symbol)}?${params}`, {
        headers: HEADERS,
        next: { revalidate: timeframe === "1Day" || timeframe === "1Week" ? 3600 : 300 },
      });
      if (!res.ok) return [];

      const json = (await res.json()) as YahooChart;
      const result = json.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      if (!result?.timestamp || !quote) return [];

      return result.timestamp
        .map((time, i) => ({
          time,
          open: quote.open?.[i] ?? null,
          high: quote.high?.[i] ?? null,
          low: quote.low?.[i] ?? null,
          close: quote.close?.[i] ?? null,
          volume: quote.volume?.[i] ?? 0,
        }))
        // Yahoo pads non-trading intervals with nulls rather than omitting them.
        .filter(
          (b): b is Bar =>
            b.open != null && b.high != null && b.low != null && b.close != null,
        );
    } catch {
      return [];
    }
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;

    try {
      const res = await fetch(
        `${CHART}/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        { headers: HEADERS, next: { revalidate: 60 } },
      );
      if (!res.ok) return null;

      const json = (await res.json()) as YahooChart;
      const meta = json.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;

      const previous = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const change = previous != null ? meta.regularMarketPrice - previous : null;

      return {
        symbol: symbol.toUpperCase(),
        price: meta.regularMarketPrice,
        change,
        changePercent: change != null && previous ? change / previous : null,
        previousClose: previous,
        dayHigh: meta.regularMarketDayHigh ?? null,
        dayLow: meta.regularMarketDayLow ?? null,
        volume: meta.regularMarketVolume ?? null,
        // Yahoo's delay varies by exchange and is not stated per response, so
        // this never claims to be live.
        freshness: "delayed-15min",
        asOf: meta.regularMarketTime
          ? new Date(meta.regularMarketTime * 1000).toISOString()
          : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Annual fundamentals, mapped onto the canonical model so the scoring engine
   * treats them identically to an SEC filing.
   */
  async getFundamentals(symbol: string): Promise<NormalizedFundamentals | null> {
    if (!this.isConfigured()) return null;

    const types = Object.values(SERIES).join(",");
    const params = new URLSearchParams({
      symbol,
      type: types,
      // Ten years back, comfortably ahead — the window simply has to contain
      // every annual period.
      period1: String(Math.floor(Date.now() / 1000) - 10 * 365 * 86400),
      period2: String(Math.floor(Date.now() / 1000) + 86400),
    });

    try {
      const res = await fetch(`${TIMESERIES}/${encodeURIComponent(symbol)}?${params}`, {
        headers: HEADERS,
        next: { revalidate: 60 * 60 * 12 },
      });
      if (!res.ok) return null;

      const json = (await res.json()) as YahooTimeseries;
      const results = json.timeseries?.result ?? [];
      if (results.length === 0) return null;

      // Yahoo returns one array per requested series; regroup by fiscal period.
      const byDate = new Map<string, Partial<Record<CanonicalField, Fact>>>();
      let currency: string | null = null;

      for (const [field, seriesName] of Object.entries(SERIES) as [
        CanonicalField,
        string,
      ][]) {
        const series = results.find((r) => r.meta?.type?.[0] === seriesName);
        const points = series?.[seriesName];
        if (!Array.isArray(points)) continue;

        for (const point of points) {
          if (!point?.asOfDate || point.reportedValue?.raw == null) continue;
          currency ??= point.currencyCode ?? null;

          const facts = byDate.get(point.asOfDate) ?? {};
          facts[field] = {
            value: point.reportedValue.raw,
            unit: point.currencyCode ?? "USD",
            end: point.asOfDate,
            fiscalYear: Number(point.asOfDate.slice(0, 4)),
            fiscalPeriod: "FY",
            form: "annual-report",
            sourceConcept: `yahoo:${seriesName}`,
            sourceFilingUrl: null,
          };
          byDate.set(point.asOfDate, facts);
        }
      }

      const annual: FinancialPeriod[] = [...byDate.entries()]
        .map(([end, facts]) => ({
          fiscalYear: Number(end.slice(0, 4)),
          fiscalPeriod: "FY",
          end,
          form: "annual-report",
          facts,
        }))
        // Newest first, matching the SEC normalizer's ordering.
        .sort((a, b) => b.end.localeCompare(a.end));

      if (annual.length === 0) return null;

      // Same derivation the SEC path applies when liabilities go untagged.
      for (const period of annual) {
        if (!period.facts.liabilities && period.facts.assets && period.facts.equity) {
          period.facts.liabilities = {
            ...period.facts.assets,
            value: period.facts.assets.value - period.facts.equity.value,
            sourceConcept: "derived:Assets-Equity",
            derived: true,
          };
        }
      }

      // Currency is carried on each Fact's `unit`, so it needs no separate
      // field here — it is read back off the facts downstream.
      void currency;

      return {
        cik: "",
        entityName: symbol.toUpperCase(),
        taxonomy: "us-gaap",
        annual,
        missingFields: [],
      };
    } catch {
      return null;
    }
  }
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        regularMarketTime?: number;
        currency?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
  };
}

/** One reported figure for one fiscal period. */
interface YahooPoint {
  asOfDate?: string;
  currencyCode?: string;
  reportedValue?: { raw?: number };
}

/**
 * Each result holds `meta.type` naming the series, plus an array keyed by that
 * same name. The dynamic key is why this is indexed rather than a fixed shape.
 */
type YahooResult = { meta?: { type?: string[] } } & {
  [series: string]: YahooPoint[] | { type?: string[] } | undefined;
};

interface YahooTimeseries {
  timeseries?: { result?: YahooResult[] };
}

export const yahoo = new YahooProvider();
