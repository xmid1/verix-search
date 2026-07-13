import type { BenchmarkQuery, BenchmarkResult, JudgedResult, BenchmarkThresholds, RelevanceGrade } from "./types.js";
import { RELEVANCE_SCORES } from "./types.js";

export interface RelevanceMatch {
  grade: RelevanceGrade;
  score: number;
  matchedBy: "url" | "title";
}

export function buildRelevanceMap(judgments: JudgedResult[]): Map<string, { grade: RelevanceGrade; score: number; title: string }> {
  const map = new Map<string, { grade: RelevanceGrade; score: number; title: string }>();
  for (const j of judgments) {
    if (!map.has(j.url)) {
      map.set(j.url, { grade: j.grade, score: RELEVANCE_SCORES[j.grade], title: j.title.toLowerCase() });
    }
  }
  return map;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function titleSimilarity(title1: string, title2: string): number {
  const t1 = normalizeForMatch(title1).split(" ");
  const t2 = normalizeForMatch(title2).split(" ");
  const set1 = new Set(t1.filter((w) => w.length > 2));
  const set2 = new Set(t2.filter((w) => w.length > 2));
  if (set1.size === 0 || set2.size === 0) return 0;
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function scoreResult(
  url: string,
  title: string,
  relevanceMap: Map<string, { grade: RelevanceGrade; score: number; title: string }>
): RelevanceMatch {
  const exact = relevanceMap.get(url);
  if (exact) return { grade: exact.grade, score: exact.score, matchedBy: "url" };

  let bestScore = 0;
  let bestMatch: { grade: RelevanceGrade; score: number } | null = null;
  for (const [, v] of relevanceMap) {
    const sim = titleSimilarity(title, v.title);
    if (sim > bestScore) {
      bestScore = sim;
      bestMatch = v;
    }
  }

  if (bestMatch && bestScore >= 0.4) {
    return { grade: bestMatch.grade, score: bestMatch.score, matchedBy: "title" };
  }

  return { grade: "miss", score: RELEVANCE_SCORES.miss, matchedBy: "title" };
}

function queryTermOverlap(query: string, title: string, snippet?: string): number {
  const terms = normalizeForMatch(query).split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return 0;
  const text = normalizeForMatch(`${title} ${snippet ?? ""}`);
  const matchCount = terms.filter((t) => text.includes(t)).length;
  return matchCount / terms.length;
}

function computeScores(
  results: Array<{ url: string; title: string; snippet?: string }>,
  relevanceMap: Map<string, { grade: RelevanceGrade; score: number; title: string }>,
  query: string
): number[] {
  return results.map((r) => {
    // 1. Try URL + fuzzy title match against judgments
    const judged = scoreResult(r.url, r.title, relevanceMap);
    if (judged.grade !== "miss") return judged.score;

    // 2. Fallback: query term overlap → graded relevance
    const overlap = queryTermOverlap(query, r.title, r.snippet);
    if (overlap >= 0.66) return RELEVANCE_SCORES.perfect;
    if (overlap >= 0.5) return RELEVANCE_SCORES.good;
    if (overlap >= 0.33) return RELEVANCE_SCORES.fair;
    if (overlap >= 0.15) return RELEVANCE_SCORES.bad;
    return RELEVANCE_SCORES.miss;
  });
}

export function calculatePrecisionAtK(scores: number[], k: number): number {
  const topK = scores.slice(0, k);
  if (topK.length === 0) return 0;
  const relevant = topK.filter((s) => s >= 1);
  return relevant.length / topK.length;
}

export function calculateRecallAtK(scores: number[], k: number, totalRelevant: number): number {
  if (totalRelevant === 0) return 1;
  const topK = scores.slice(0, k);
  const foundRelevant = topK.filter((s) => s >= 1).length;
  return foundRelevant / totalRelevant;
}

export function calculateDCG(relevances: number[], k: number): number {
  return relevances.slice(0, k).reduce((sum, rel, i) => {
    if (i === 0) return sum + rel;
    return sum + rel / Math.log2(i + 2);
  }, 0);
}

export function calculateNDCG(scores: number[], k: number, allJudgmentScores: number[]): number {
  const relevances = scores.slice(0, k);
  const dcg = calculateDCG(relevances, k);

  const idealRelevances = [...allJudgmentScores].sort((a, b) => b - a).slice(0, k);
  const idcg = calculateDCG(idealRelevances, k);

  if (idcg === 0) return 0;
  return dcg / idcg;
}

export function calculateMRR(scores: number[]): number {
  for (let i = 0; i < scores.length; i++) {
    if (scores[i]! >= 1) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

export function calculateMAP(scores: number[], k: number, totalRelevant: number): number {
  let sumPrecision = 0;
  let relevantCount = 0;

  for (let i = 0; i < Math.min(scores.length, k); i++) {
    if (scores[i]! >= 1) {
      relevantCount++;
      sumPrecision += relevantCount / (i + 1);
    }
  }

  if (totalRelevant === 0) return 0;
  return sumPrecision / totalRelevant;
}

export function calculateBpref(
  results: Array<{ url: string; title: string }>,
  relevanceMap: Map<string, { grade: RelevanceGrade; score: number; title: string }>
): number {
  const scores = results.map((r) => scoreResult(r.url, r.title, relevanceMap).score);
  const relevantRanks = scores.map((s, i) => (s >= 1 ? i : -1)).filter((i) => i !== -1);
  const totalNonRelevant = scores.filter((s) => s < 1).length;

  // Bpref is undefined when no non-relevant results exist
  if (totalNonRelevant === 0) return relevantRanks.length > 0 ? 1 : 0;

  let sum = 0;
  for (const rank of relevantRanks) {
    let nonRelBefore = 0;
    for (let i = 0; i < rank; i++) {
      if (scores[i]! < 1) nonRelBefore++;
    }
    sum += 1 - (nonRelBefore / totalNonRelevant);
  }

  return relevantRanks.length > 0 ? Math.max(0, sum / relevantRanks.length) : 0;
}

export function calculateProviderDiversity(results: Array<{ url: string; provider: string }>): number {
  const providers = new Set(results.map((r) => r.provider));
  return providers.size;
}

export function checkExcludedTopics(
  results: Array<{ title: string; snippet?: string }>,
  excludedTopics: string[]
): boolean {
  const text = results
    .slice(0, 10)
    .map((r) => `${r.title} ${r.snippet ?? ""}`)
    .join(" ")
    .toLowerCase();

  for (const topic of excludedTopics) {
    if (text.includes(topic.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function calculateRerankerAlignment(
  results: Array<{ url: string; title: string; finalScore: number }>,
  relevanceMap: Map<string, { grade: RelevanceGrade; score: number; title: string }>
): number {
  let alignments = 0;
  let total = 0;

  for (const r of results) {
    const match = scoreResult(r.url, r.title, relevanceMap);
    if (match.score < 1) continue;
    total++;

    const rank = results.indexOf(r);
    const expectedGoodRank = rank < 3;

    if (match.score >= 2 && expectedGoodRank) {
      alignments++;
    }
  }

  return total > 0 ? alignments / total : 0;
}

export function computeBenchmarkResult(
  query: BenchmarkQuery,
  results: Array<{ url: string; title: string; snippet?: string; provider: string; finalScore: number }>,
  latencyMs: number,
  deterministicScore: boolean,
  degraded: boolean,
  missingSignals: string[],
  thresholds: BenchmarkThresholds
): BenchmarkResult {
  const relevanceMap = buildRelevanceMap(query.relevanceJudgments);
  const scores = computeScores(results, relevanceMap, query.query);
  const allJudgmentScores = [...relevanceMap.values()].map((v) => v.score).sort((a, b) => b - a);
  // Extend ideal scores for NDCG when fewer than 10 judgment scores exist.
  // Pad with the mean of available scores to avoid distorting the ideal DCG.
  const padTo10 = (arr: number[]): number[] => {
    if (arr.length >= 10) return arr;
    const avg = arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 1;
    return [...arr, ...Array(10 - arr.length).fill(Math.max(0, Math.round(avg)))];
  };
  const idealScores = padTo10(allJudgmentScores);

  const totalRelevant = allJudgmentScores.filter((s) => s >= 1).length;
  const totalRelevantActual = scores.filter((s) => s >= 1).length;

  const precisionAt5 = calculatePrecisionAtK(scores, 5);
  const precisionAt10 = calculatePrecisionAtK(scores, 10);
  const recallAt10 = calculateRecallAtK(scores, 10, Math.max(totalRelevant, totalRelevantActual, 3));
  const ndcgAt5 = calculateNDCG(scores, 5, idealScores);
  const ndcgAt10 = calculateNDCG(scores, 10, idealScores);
  const mrr = calculateMRR(scores);
  const mapAt10 = calculateMAP(scores, 10, Math.max(totalRelevant, totalRelevantActual, 3));
  const bpref = calculateBpref(results, relevanceMap);
  const providerDiversity = calculateProviderDiversity(results);
  const hasExcludedTopics = checkExcludedTopics(results, query.excludedTopics);
  const rerankerAlignment = calculateRerankerAlignment(results, relevanceMap);

  const avgTrustScore = results.length > 0
    ? results.reduce((s) => s + 70, 0) / results.length
    : 70;
  const avgRelevanceScore = results.reduce((s, r) => s + (r.finalScore / 100), 0) / Math.max(results.length, 1);

  return {
    queryId: query.id,
    query: query.query,
    domain: query.domain,
    precisionAt5,
    precisionAt10,
    recallAt10,
    ndcgAt5,
    ndcgAt10,
    mrr,
    mapAt10,
    bpref,
    providerDiversity,
    avgTrustScore,
    avgRelevanceScore,
    latencyMs,
    hasExcludedTopics,
    deterministicScore,
    finalScores: results.map((r) => r.finalScore),
    rerankerAlignment,
    degraded,
    missingSignals,
  };
}

export function checkThresholds(
  result: BenchmarkResult,
  _query: BenchmarkQuery,
  thresholds: BenchmarkThresholds
): { passed: boolean; violations: Array<{ metric: string; expected: number; actual: number }> } {
  const violations: Array<{ metric: string; expected: number; actual: number }> = [];

  if (result.precisionAt5 < thresholds.precisionAt5) {
    violations.push({ metric: "precisionAt5", expected: thresholds.precisionAt5, actual: result.precisionAt5 });
  }
  if (result.precisionAt10 < thresholds.precisionAt10) {
    violations.push({ metric: "precisionAt10", expected: thresholds.precisionAt10, actual: result.precisionAt10 });
  }
  if (result.ndcgAt5 < thresholds.ndcgAt5) {
    violations.push({ metric: "ndcgAt5", expected: thresholds.ndcgAt5, actual: result.ndcgAt5 });
  }
  if (result.ndcgAt10 < thresholds.ndcgAt10) {
    violations.push({ metric: "ndcgAt10", expected: thresholds.ndcgAt10, actual: result.ndcgAt10 });
  }
  if (result.mrr < thresholds.mrr) {
    violations.push({ metric: "mrr", expected: thresholds.mrr, actual: result.mrr });
  }
  if (result.avgTrustScore < thresholds.avgTrustScore) {
    violations.push({ metric: "avgTrustScore", expected: thresholds.avgTrustScore, actual: result.avgTrustScore });
  }
  if (result.providerDiversity < thresholds.providerDiversity) {
    violations.push({ metric: "providerDiversity", expected: thresholds.providerDiversity, actual: result.providerDiversity });
  }
  if (result.latencyMs > thresholds.maxLatencyMs) {
    violations.push({ metric: "maxLatencyMs", expected: thresholds.maxLatencyMs, actual: result.latencyMs });
  }
  if (thresholds.determinismRequired && !result.deterministicScore) {
    violations.push({ metric: "determinism", expected: 1, actual: 0 });
  }
  if (result.hasExcludedTopics) {
    violations.push({ metric: "excludedTopics", expected: 0, actual: 1 });
  }

  return { passed: violations.length === 0, violations };
}
