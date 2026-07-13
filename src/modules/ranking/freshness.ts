/**
 * Freshness score based on publication date.
 *
 * Buckets per spec:
 *   today       -> 100
 *   <= 1 week   -> 95
 *   <= 1 month  -> 90
 *   <= 6 months -> 75
 *   <= 1 year   -> 60
 *   older       -> 30
 *
 * If publishedAt is missing or unparseable, we return 50 (neutral).
 * Rationale: we must never fabricate or guess a date to inflate the score.
 * A missing date gives no signal, so neutral (50) is the honest choice.
 */
export function freshnessScore(publishedAt?: string | Date): number {
  if (publishedAt === undefined || publishedAt === null) return 50;

  let date: Date;
  if (publishedAt instanceof Date) {
    date = publishedAt;
  } else {
    date = new Date(publishedAt);
  }

  // Guard against unparseable strings (e.g. "unknown", empty string, garbage)
  if (isNaN(date.getTime())) return 50;

  const now = Date.now();
  const ageMs = now - date.getTime();

  // Negative age (future date) — treat as today
  if (ageMs < 0) return 100;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const ONE_WEEK_MS = 7 * ONE_DAY_MS;
  const ONE_MONTH_MS = 30 * ONE_DAY_MS;
  const SIX_MONTHS_MS = 6 * ONE_MONTH_MS;
  const ONE_YEAR_MS = 365 * ONE_DAY_MS;

  if (ageMs < ONE_DAY_MS) return 100;
  if (ageMs <= ONE_WEEK_MS) return 95;
  if (ageMs <= ONE_MONTH_MS) return 90;
  if (ageMs <= SIX_MONTHS_MS) return 75;
  if (ageMs <= ONE_YEAR_MS) return 60;
  return 30;
}
