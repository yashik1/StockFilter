import type { Bar, Quote, Timeframe } from "./types";

/**
 * Failover across price providers, with a short in-process cache.
 *
 * Every free tier has a ceiling, so relying on one makes charts break the moment
 * it is reached. Requests fall through the chain until a provider answers.
 *
 * Every failure moves to the next provider, including "this symbol has no data".
 * That last one used to end the search, on the reasoning that an unknown ticker
 * should not burn every provider's quota in turn. It was wrong: the providers
 * cover different markets, so "no data" describes one provider's universe and
 * never the symbol. Twelve Data's free tier is US-focused and has nothing for a
 * Toronto-listed fund like XEQT, while Yahoo — the last link, and the only one
 * with real coverage outside the US — was never reached, which defeated the
 * reason it is in the chain at all.
 *
 * The cost of getting this wrong in the other direction is small and bounded: a
 * genuinely bogus ticker makes one request per provider, on the failure path
 * only, and the outcome is cached.
 */

export interface PriceSource {
  readonly name: string;
  isConfigured(): boolean;
  /** Optional guard for providers that cannot serve every timeframe. */
  supports?(timeframe: Timeframe): boolean;
  getBars(symbol: string, timeframe: Timeframe, from: Date, to: Date): Promise<Bar[]>;
  getQuote(symbol: string): Promise<Quote | null>;
}

export interface FailoverResult<T> {
  value: T;
  /** Which provider answered, for display and debugging. */
  source: string | null;
  /** Providers that failed, and why. */
  attempts: { provider: string; error: string }[];
}

/**
 * Cache of successful responses.
 *
 * The cheapest way to avoid a rate limit is not to make the request. Repeated
 * views of the same chart are extremely common, and this keeps them off the
 * network entirely for the life of the process.
 */
const cache = new Map<string, { value: unknown; expires: number }>();
const MAX_ENTRIES = 500;

function readCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function writeCache(key: string, value: unknown, ttlSeconds: number): void {
  // Simple bound: drop the oldest insertion when full.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

/** Exposed so tests can start from a known state. */
export function clearPriceCache(): void {
  cache.clear();
}

/** How long each timeframe's bars stay fresh. */
function barsTtl(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1Min":
      return 60;
    case "5Min":
      return 300;
    case "15Min":
      return 900;
    case "1Hour":
      return 1800;
    default:
      return 3600;
  }
}

export async function fetchBarsWithFailover(
  sources: PriceSource[],
  symbol: string,
  timeframe: Timeframe,
  from: Date,
  to: Date,
): Promise<FailoverResult<Bar[]>> {
  const key = `bars:${symbol}:${timeframe}:${from.toISOString().slice(0, 13)}:${to
    .toISOString()
    .slice(0, 13)}`;

  const cached = readCache<FailoverResult<Bar[]>>(key);
  if (cached) return cached;

  const attempts: { provider: string; error: string }[] = [];

  for (const source of sources) {
    if (!source.isConfigured()) continue;
    if (source.supports && !source.supports(timeframe)) {
      attempts.push({ provider: source.name, error: `does not serve ${timeframe} bars` });
      continue;
    }

    try {
      const bars = await source.getBars(symbol, timeframe, from, to);
      if (bars.length > 0) {
        const result = { value: bars, source: source.name, attempts };
        writeCache(key, result, barsTtl(timeframe));
        return result;
      }
      // An empty response says this provider has nothing for the symbol, which
      // is a statement about its coverage rather than about the symbol.
      attempts.push({ provider: source.name, error: "returned no bars" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: source.name, error: message });
    }
  }

  return { value: [], source: null, attempts };
}

export async function fetchQuoteWithFailover(
  sources: PriceSource[],
  symbol: string,
): Promise<FailoverResult<Quote | null>> {
  const key = `quote:${symbol}`;
  const cached = readCache<FailoverResult<Quote | null>>(key);
  if (cached) return cached;

  const attempts: { provider: string; error: string }[] = [];

  for (const source of sources) {
    if (!source.isConfigured()) continue;

    try {
      const quote = await source.getQuote(symbol);
      if (quote?.price != null) {
        const result = { value: quote, source: source.name, attempts };
        writeCache(key, result, 60);
        return result;
      }
      attempts.push({ provider: source.name, error: "no quote returned" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: source.name, error: message });
    }
  }

  return { value: null, source: null, attempts };
}

