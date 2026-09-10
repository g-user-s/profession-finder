/**
 * "How much cheaper than usual is this?" needs a baseline, and we have no
 * access to Google's own historical pricing model. So we build our own:
 * the daily cron (see app/api/cron/daily-snapshot) records each day's
 * cheapest "tomorrow" price per destination, and this baseline is the
 * median of the last MAX_HISTORY_SAMPLES of those observations.
 *
 * Median over mean: a single anomalous spike or an error-recovered price
 * shouldn't drag the "usual price" around the way it would a mean.
 */
export const MAX_HISTORY_SAMPLES = 30;
export const MIN_SAMPLES_FOR_BASELINE = 5;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export type PriceComparison = {
  baseline: number | null;
  discountPercent: number | null;
};

/**
 * Returns a discount percentage only when there's enough history to trust
 * it, and only when the current price is actually cheaper — this badge
 * should never claim a discount it can't back up.
 */
export function compareToHistory(currentPrice: number, history: number[]): PriceComparison {
  if (history.length < MIN_SAMPLES_FOR_BASELINE) {
    return { baseline: null, discountPercent: null };
  }

  const baseline = median(history);
  if (baseline === null || baseline <= 0) {
    return { baseline, discountPercent: null };
  }

  const discountPercent = Math.round((1 - currentPrice / baseline) * 100);
  return {
    baseline,
    discountPercent: discountPercent > 0 ? discountPercent : null
  };
}
