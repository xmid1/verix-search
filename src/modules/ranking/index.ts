/**
 * Ranking orchestrator — combines all signals into a final sorted result list.
 *
 * For each candidate:
 *   1. bm25Rank              — keyword relevance (pure, fast)
 *   2. semanticSimilarityScores — embedding-based similarity
 *   3. aiRelevanceScores     — LLM-based relevance (batched, one call total)
 *   4. trustScore            — domain reputation
 *   5. freshnessScore        — publication recency
 *   6. spamPenalty           — content quality heuristics
 *   7. popularityScore       — platform-specific popularity (stars, downloads, etc.)
 *   8. codeQualityScore      — code platform / code snippet quality
 *   9. hasExamplesScore      — presence of code examples
 *  10. authorityScore        — domain/author authority
 *
 * Results are sorted descending by finalScore.
 */
import { childLogger } from "../../infra/logger.js";
import type { RankingSignals } from "../../core/types.js";
import { bm25Rank } from "./bm25.js";
import { semanticSimilarityScores } from "./semantic.js";
import { aiRelevanceScores } from "./aiRelevance.js";
import { trustScore } from "./trust.js";
import { freshnessScore } from "./freshness.js";
import { spamPenalty } from "./spam.js";
import { popularityScore } from "./popularity.js";
import { codeQualityScore } from "./codeQuality.js";
import { hasExamplesScore } from "./hasExamples.js";
import { authorityScore } from "./authority.js";
import { sourceQualityScore } from "./sourceQuality.js";
import { heuristicCredibility } from "./credibilityGraph.js";
import { computeFinalScore } from "./fusion.js";

const log = childLogger({ module: "ranking" });

export interface RankingCandidate {
  id: string;
  url: string;
  title: string;
  snippet?: string;
  extractedText?: string;
  publishedAt?: string;
  author?: string;
  provider?: string;
}

export interface RankingOutput {
  id: string;
  signals: RankingSignals;
  finalScore: number;
  missingSignals?: string[];
}

export async function rankResults(
  query: string,
  candidates: RankingCandidate[],
  quick = false,
  keywordBoostMap?: Map<string, number>,
  intent?: string
): Promise<RankingOutput[]> {
  if (candidates.length === 0) return [];

  log.info({ query, count: candidates.length }, "ranking candidates");

  // Build text basis for each candidate — prefer extractedText, fall back to
  // snippet, then title. Never leave text empty.
  const docTexts = candidates.map((c) => ({
    id: c.id,
    text: (c.extractedText ?? c.snippet ?? c.title).trim() || c.title,
  }));

  // Build snippet-based list for AI relevance (title + snippet)
  const docSnippets = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    snippet: (c.snippet ?? c.extractedText ?? c.title).trim() || c.title,
  }));

  // ── Run the fast, synchronous signals first ──────────────────────────────
  const bm25Scores = bm25Rank(query, docTexts);

  const trustScores = new Map(candidates.map((c) => [c.id, trustScore(c.url)]));

  // spamPenalty now receives trustScore so trusted domains (trust ≥ 80)
  // get 90% penalty reduction — MDN docs are NOT spam.
  const spamScores = new Map(
    docTexts.map((d) => [d.id, spamPenalty(d.text, trustScores.get(d.id), intent)])
  );

  const freshnessScores = new Map(
    candidates.map((c) => [c.id, freshnessScore(c.publishedAt)])
  );

  // ── Run the async signals concurrently ───────────────────────────────────
  // Quick mode: skip only aiRelevance (expensive LLM call).
  // semanticSimilarity uses local embeddings — still useful for ordering.
  // Both have internal try/catch and return empty Map on failure.
  const [semanticScores, aiScores] = await Promise.all([
    semanticSimilarityScores(query, docTexts),
    quick
      ? Promise.resolve(new Map<string, number>())
      : aiRelevanceScores(query, docSnippets),
  ]);

  const missingSignals = new Set<string>();
  if (aiScores.size === 0 && docSnippets.length > 0) {
    missingSignals.add("aiRelevance");
  }
  if (semanticScores.size === 0 && docTexts.length > 0) {
    missingSignals.add("semanticSimilarity");
  }

  const outputs: RankingOutput[] = candidates.map((c) => {
    const trust = trustScores.get(c.id) ?? 40;
    let adjustedTrust = trust;
    try {
      const domain = new URL(c.url).hostname;
      const credibility = heuristicCredibility(domain, c.provider ?? "");
      adjustedTrust = Math.round(Math.min(100, trust * (credibility / 50)));
    } catch {
      // Invalid URL — use unadjusted trust
    }
    const signals: RankingSignals = {
      trust: adjustedTrust,
      freshness: freshnessScores.get(c.id) ?? 50,
      aiRelevance: aiScores.get(c.id) ?? 0.5,
      semanticSimilarity: semanticScores.get(c.id) ?? 0.5,
      bm25: bm25Scores.get(c.id) ?? 0,
      spamPenalty: spamScores.get(c.id) ?? 0,
      popularity: popularityScore(c.provider, c.url, c.snippet),
      codeQuality: codeQualityScore(c.url, c.snippet),
      hasExamples: hasExamplesScore(c.snippet ?? c.extractedText),
      authority: authorityScore(c.url, c.author, trust),
      sourceQuality: sourceQualityScore(c.url, c.provider),
    };

    const providerBoost = keywordBoostMap?.get(c.provider ?? "") ?? 1.0;
    const finalScore = computeFinalScore(signals, providerBoost);
    return {
      id: c.id,
      signals,
      finalScore,
      missingSignals: missingSignals.size > 0 ? [...missingSignals] : undefined,
    };
  });

  // Sort descending by final score
  outputs.sort((a, b) => b.finalScore - a.finalScore);

  log.info({ query, ranked: outputs.length }, "ranking complete");
  return outputs;
}
