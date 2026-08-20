/**
 * Moving averages and momentum indicators, computed over a bar series.
 *
 * These describe what a price has already done — an average of the last N
 * closes, or how one-sided recent moves have been. They are not forecasts, and
 * nothing here scores or recommends anything; the app's own view is that a
 * company's filings tell you more about it than the shape of its price line.
 * They earn their place because a reader arriving from a charting tool expects
 * to see them, and because a long average is a genuinely useful way to read a
 * noisy line: it answers "is this above or below where it has been sitting?"
 * without the reader eyeballing it.
 *
 * Every function returns an array the same length as its input, with `null`
 * for the leading positions where there is not yet enough history. Returning
 * a shorter array instead would silently misalign every value against its bar
 * — an off-by-`period` error that looks plausible on a chart, which is the
 * worst kind.
 */

/**
 * Simple moving average: the plain mean of the last `period` closes.
 *
 * Computed with a running sum rather than re-summing a window per bar, so a
 * ten-year daily series stays linear rather than quadratic.
 */
export function sma(values: number[], period: number): (number | null)[] {
  if (period <= 0) return values.map(() => null);

  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }

  return out;
}

/**
 * Exponential moving average: weights recent closes more heavily.
 *
 * Seeded with the simple average of the first `period` values rather than with
 * the first close alone. Seeding on one price lets a single unrepresentative
 * open drag the line for dozens of bars afterwards, which is visible as a
 * wrong-looking hook at the left edge of a chart.
 */
export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0) return values.map(() => null);

  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const multiplier = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * multiplier + prev;
    out[i] = prev;
  }

  return out;
}

/**
 * Relative Strength Index, 0-100, using Wilder's original smoothing.
 *
 * Wilder's method — a running average that gives each new value a weight of
 * 1/period — is what every charting package means by "RSI". A plain rolling
 * mean of gains and losses is a different, more jagged indicator that happens
 * to share the name, and would not line up with what a reader sees elsewhere.
 *
 * Returns 100 for a window with no losses at all, which is the conventional
 * boundary rather than a division by zero.
 */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = toRsi(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = toRsi(avgGain, avgLoss);
  }

  return out;
}

function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Bollinger Bands: a moving average with a band drawn a number of standard
 * deviations either side of it.
 *
 * The width is the point. The bands widen when the recent closes have been
 * scattered and narrow when they have been tight, so "price is at the lower
 * band" means "unusually low *for how much this thing has been moving
 * lately*" rather than a fixed percentage below average. That is what makes it
 * usable as a mean-reversion trigger across instruments with very different
 * volatility.
 *
 * Uses the population standard deviation over the same window as the average,
 * which is what Bollinger defined and what every charting package draws. The
 * sample deviation (dividing by n-1) gives visibly wider bands on short
 * periods and would not line up with the same symbol viewed elsewhere.
 */
export function bollinger(
  values: number[],
  period = 20,
  deviations = 2,
): { middle: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  if (period <= 0) return { middle, upper, lower };

  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i];
    if (mean == null) continue;

    let sumSquares = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - mean;
      sumSquares += diff * diff;
    }

    const sd = Math.sqrt(sumSquares / period);
    upper[i] = mean + deviations * sd;
    lower[i] = mean - deviations * sd;
  }

  return { middle, upper, lower };
}
