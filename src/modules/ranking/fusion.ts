/**
 * Score fusion utilities.
 *
 * reciprocalRankFusion — standard RRF combining multiple ranked lists.
 * computeFinalScore    — weighted-sum combination of all ranking signals.
 */
import type { RankingSignals } from "../../core/types.js";

/**
 * Reciprocal Rank Fusion (RRF).
 *
 * Given an array of Maps (id -> score, higher-is-better), derives rank
 * positions by sorting each map descending, then sums 1/(k + rank) across
 * all rankings. Returns normalized 0-1 scores (divide by max RRF score).
 *
 * k = 60 is the standard value from the original paper (Cormack et al. 2009).
 */
export function reciprocalRankFusion(
  rankings: Map<string, number>[],
  k = 60
): Map<string, number> {
  const rrf = new Map<string, number>();

  for (const ranking of rankings) {
    // Sort ids descending by score to obtain rank positions
    const sorted = [...ranking.entries()].sort((a, b) => b[1] - a[1]);
    sorted.forEach(([id], rankIndex) => {
      // rank is 1-based
      const contribution = 1 / (k + rankIndex + 1);
      rrf.set(id, (rrf.get(id) ?? 0) + contribution);
    });
  }

  // Normalize to 0-1
  const maxRRF = Math.max(...rrf.values(), 0);
  if (maxRRF > 0) {
    for (const [id, score] of rrf) {
      rrf.set(id, score / maxRRF);
    }
  }

  return rrf;
}

/**
 * Weighted sum of all ranking signals into a final score (0-100).
 *
 * Design note: The spec describes the final ranking conceptually as a product
 * of signals ("Trust × Freshness × AI Relevance × …"). In practice, a product
 * of six 0-1 numbers collapses toward zero (e.g. 0.8^6 ≈ 0.26 before any
 * signal is truly "bad"), making the absolute values uninformative and
 * preventing meaningful discrimination between results.  A weighted SUM is
 * used instead — it preserves the relative importance encoded in the weights
 * while keeping the output in a useful 0-100 range.
 *
 * Weights (must sum to ≤ 1.0 before the spam penalty):
 *   trust             0.20
 *   aiRelevance       0.20
 *   semanticSimilarity 0.13
 *   bm25              0.11
 *   freshness         0.10
 *   sourceQuality     0.10
 *   popularity        0.05
 *   codeQuality       0.04
 *   hasExamples       0.03
 *   authority         0.02
 *   ──────────────────────
 *   subtotal          0.98 (remainder absorbed by spam penalty)
 *
 *   spamPenalty applied as: − spamPenalty/100 * 0.25 * 100 (subtractive, up to 25 pts)
 *
 *   keywordBoost: optional multiplier (e.g. 1.2 = +20%) for results from
 *   providers that match explicit keywords in the query (e.g. "youtube" in
 *   query → YouTube results get boosted).
 *
 *   BM25 penalty: if BM25 is high (>0.7) but semanticSimilarity is low (<0.5),
 *   it's likely a keyword false match (e.g. "best practices" matching unrelated
 *   docs). BM25 contribution is halved in that case.
 */
export function computeFinalScore(signals: RankingSignals, keywordBoost = 1.0): number {
  // BM25 false-match penalty: if BM25 is moderate (>0.5) but
  // semanticSimilarity is genuinely low (<0.55 — NOT the default 0.5
  // that is used when embeddings are unavailable), keywords matched
  // the wrong topic (e.g. "best practices" matching unrelated docs).
  // Default 0.5 means embeddings failed -> skip the penalty.
  let effectiveBm25 = signals.bm25;
  const embeddingsAvailable = signals.semanticSimilarity !== 0.5;
  if (signals.bm25 > 0.5 && signals.semanticSimilarity < 0.55 && embeddingsAvailable) {
    effectiveBm25 *= 0.5;
  }

  // BM25 = 0 penalty: if no query keyword appears in the document at all
  // (BM25 < 0.01), the result is fundamentally off-topic regardless of
  // semantic similarity (embedding false positives). Subtract 15 points
  // from the final score to push such results out of the top 10.
  const zeroBm25Penalty = signals.bm25 < 0.01 ? 15 : 0;

  // All input signals except spamPenalty are already 0-1 normalized.
  // trust and freshness come in as 0-100 from their respective modules, so
  // divide them here.
  const sourceQuality = signals.sourceQuality ?? 0.5;
  const raw =
    (signals.trust / 100) * 0.20 +
    signals.aiRelevance * 0.20 +
    signals.semanticSimilarity * 0.13 +
    effectiveBm25 * 0.11 +
    (signals.freshness / 100) * 0.10 +
    sourceQuality * 0.10 +
    signals.popularity * 0.05 +
    signals.codeQuality * 0.04 +
    signals.hasExamples * 0.03 +
    signals.authority * 0.02 -
    (signals.spamPenalty / 100) * 0.25;

  // Scale to 0-100, subtract zero-BM25 penalty, apply keyword boost, and clamp
  let score = raw * 100 - zeroBm25Penalty;
  score *= keywordBoost;
  return Math.min(Math.max(score, 0), 100);
}
