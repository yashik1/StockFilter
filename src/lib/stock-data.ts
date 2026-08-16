import { fieldValue } from "./fundamentals/normalize";
import type { NormalizedFundamentals } from "./fundamentals/types";
import {
  getFundamentalsWithSource,
  getInstrumentType,
  getNewsWithSource,
  getPeers,
  getProvider,
} from "./providers";
import type { CompanyProfile, Filing, InstrumentType, NewsItem, Quote } from "./providers/types";
import { ProviderNotConfiguredError } from "./providers/types";
import { sectorFromSic, type SectorKind } from "./scoring/applicability";
import { buildHealthReport, type HealthReport } from "./scoring/health";
import { resolveType } from "./compare";

export interface StockPageData {
  symbol: string;
  profile: CompanyProfile | null;
  fundamentals: NormalizedFundamentals | null;
  quote: Quote | null;
  news: NewsItem[];
  /**
   * Why the news list is empty, when it is.
   *
   * "no key set" and "the key was refused" and "nothing has been written about
   * this company lately" are different situations with different remedies, and
   * an empty array cannot tell them apart.
   */
  newsStatus: { state: "ok" | "not-configured" | "failed"; message: string | null };
  /**
   * Which source the headlines came from.
   *
   * Worth showing, because the chain ends at EDGAR: a reader looking at
   * "the company reported a major event" is reading the company's own filing,
   * not a journalist's account of it, and should be able to tell.
   */
  newsSource: string | null;
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
      getFundamentalsWithSource(upper).catch(() => ({
        fundamentals: null,
        currency: null,
        source: "SEC EDGAR",
      })),
      provider.getQuote(upper).catch(() => null),
      getNewsWithSource(upper, 12).then(
        ({ news: items, source }) => ({ items, source, error: null as Error | null }),
        (err: unknown) => ({
          items: [] as NewsItem[],
          source: null as string | null,
          error: err instanceof Error ? err : new Error(String(err)),
        }),
      ),
      provider.getFilings(upper, 20).catch(() => []),
      getPeers(upper).catch(() => []),
      getInstrumentType(upper).catch(() => "unknown" as InstrumentType),
    ]);

  const resolvedFundamentals = fundamentals.fundamentals;
  const reportingCurrency = fundamentals.currency;

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
    news: news.items,
    newsStatus: describeNews(news.error),
    newsSource: news.source,
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

/**
 * Turns whatever the news provider threw into something the page can explain.
 *
 * Sorted by the error's type rather than by reading its text. Matching on the
 * message looked equivalent and was not: the message for a *refused* key names
 * the variable to go and check, so a substring test for "FINNHUB_API_KEY"
 * classified a rejected key as an absent one and told an operator who had set
 * one to go and set it.
 */
export function describeNews(error: Error | null): StockPageData["newsStatus"] {
  if (!error) return { state: "ok", message: null };

  if (error instanceof ProviderNotConfiguredError) {
    return { state: "not-configured", message: error.message };
  }
  return { state: "failed", message: error.message };
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
