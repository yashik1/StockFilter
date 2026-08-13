import { fieldValue } from "./fundamentals/normalize";
import type { NormalizedFundamentals } from "./fundamentals/types";
import { getInstrumentType, getPeers, getProvider } from "./providers";
import { alphaVantage } from "./providers/alphavantage";
import type { CompanyProfile, Filing, InstrumentType, NewsItem, Quote } from "./providers/types";
import { sectorFromSic, type SectorKind } from "./scoring/applicability";
import { buildHealthReport, type HealthReport } from "./scoring/health";
import { resolveType } from "./compare";

export interface StockPageData {
  symbol: string;
  profile: CompanyProfile | null;
  fundamentals: NormalizedFundamentals | null;
  quote: Quote | null;
  news: NewsItem[];
  filings: Filing[];
  peers: string[];
  sector: SectorKind;
  marketCap: number | null;
  report: HealthReport | null;
  /** Funds file no statements, so scoring is suppressed rather than computed. */
  instrumentType: InstrumentType;
  /**
   * Currency the statements were reported in. A Canadian filer reports CAD, so
   * absolute figures are not comparable with a US company's even though the
   * ratios are.
   */
  reportingCurrency: string | null;
}

/**
 * Assembles everything the stock page needs.
 *
 * Reads live from the providers rather than the database so a stock page works
 * immediately after deploy, before any ingest has run and for any symbol in
 * EDGAR — not just the precomputed screening universe. Responses are cached by
 * the fetch layer, so repeat views are cheap.
 *
 * Optional sources fail soft: missing news or an unset price key degrades that
 * section only, never the page.
 */
export async function getStockPageData(symbol: string): Promise<StockPageData> {
  const provider = getProvider();
  const upper = symbol.toUpperCase();

  const [profile, fundamentals, quote, news, filings, peers, providerType] =
    await Promise.all([
      provider.getProfile(upper).catch(() => null),
      provider.getFundamentals(upper).catch(() => null),
      provider.getQuote(upper).catch(() => null),
      provider.getNews(upper, 12).catch(() => []),
      provider.getFilings(upper, 20).catch(() => []),
      getPeers(upper).catch(() => []),
      getInstrumentType(upper).catch(() => "unknown" as InstrumentType),
    ]);

  // EDGAR has nothing, so this is a listing outside SEC coverage. Alpha
  // Vantage is consulted only here, never during the nightly universe pass —
  // its free allowance is 25 requests a day, which suits an occasional lookup
  // and would take weeks to cover the whole universe.
  let fallbackFundamentals: NormalizedFundamentals | null = null;
  let reportingCurrency: string | null = null;

  if (!fundamentals?.annual.length && alphaVantage.isConfigured()) {
    const matches = await alphaVantage.search(upper, 5).catch(() => []);
    // Alpha Vantage keys foreign listings by an exchange suffix (ATZ -> ATZ.TRT),
    // so the bare ticker has to be resolved before the statements can be read.
    const match =
      matches.find((m) => m.symbol.toUpperCase().startsWith(`${upper}.`)) ??
      matches.find((m) => m.symbol.toUpperCase() === upper);

    if (match) {
      fallbackFundamentals = await alphaVantage
        .getFundamentals(match.symbol)
        .catch(() => null);
      reportingCurrency = fallbackFundamentals?.annual[0]?.facts.assets?.unit ?? null;
    }
  }

  const resolvedFundamentals = fundamentals?.annual.length ? fundamentals : fallbackFundamentals;

  const sector = sectorFromSic(profile?.sicCode);

  // Prefer the provider's market cap; otherwise derive it from the live price
  // and the share count in the filings.
  let marketCap = profile?.marketCap ?? null;
  if (marketCap == null && quote?.price && resolvedFundamentals) {
    const shares =
      fieldValue(resolvedFundamentals.annual[0], "sharesOutstanding") ??
      profile?.sharesOutstanding ??
      null;
    if (shares) marketCap = quote.price * shares;
  }

  const report = resolvedFundamentals?.annual.length
    ? buildHealthReport(resolvedFundamentals, sector, marketCap)
    : null;

  return {
    symbol: upper,
    profile,
    fundamentals: resolvedFundamentals,
    quote,
    news,
    filings,
    peers,
    sector,
    marketCap,
    report,
    instrumentType: resolveType(
      providerType,
      Boolean(resolvedFundamentals?.annual.length),
      profile?.entityType,
      profile?.sicCode,
    ),
    reportingCurrency,
  };
}

/** Extracts a yearly series of one canonical field, oldest first, for charting. */
export function yearlySeries(
  fundamentals: NormalizedFundamentals | null,
  field: Parameters<typeof fieldValue>[1],
  years = 6,
): { year: number; value: number }[] {
  if (!fundamentals) return [];
  return fundamentals.annual
    .slice(0, years)
    .map((p) => ({ year: p.fiscalYear, value: fieldValue(p, field) }))
    .filter((d): d is { year: number; value: number } => d.value != null)
    .reverse();
}
