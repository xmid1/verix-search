import { BENCHMARK_QUERIES } from "./dataset.js";
import type { RankedResult } from "../core/types.js";

interface MockResult {
  url: string;
  title: string;
  snippet: string;
  provider: string;
  finalScore: number;
  trust: number;
  freshness: number;
  popularity: number;
  authority: number;
  codeQuality: number;
  hasExamples: number;
  aiRelevance: number;
  semanticSimilarity: number;
  bm25: number;
  sourceQuality: number;
  spamPenalty: number;
}

const mockData = new Map<string, MockResult[]>();

function buildMocks(): void {
  for (const q of BENCHMARK_QUERIES) {
    const results: MockResult[] = [];
    for (let i = 0; i < q.relevanceJudgments.length; i++) {
      const j = q.relevanceJudgments[i]!;
      results.push({
        url: j.url,
        title: j.title,
        snippet: j.note ?? "Mock content for benchmark evaluation",
        provider: q.expectedProviders[i % q.expectedProviders.length] ?? "github",
        finalScore: Math.max(10, 100 - i * 10),
        trust: 80 - i * 5,
        freshness: 70 - i * 5,
        popularity: 60 - i * 10,
        authority: 85 - i * 5,
        codeQuality: i < 2 ? 90 : 50,
        hasExamples: i < 1 ? 80 : 30,
        aiRelevance: 75 - i * 8,
        semanticSimilarity: 70 - i * 7,
        bm25: 65 - i * 6,
        sourceQuality: 80 - i * 5,
        spamPenalty: 0,
      });
    }
    // Add extra filler results for queries with few judgments
    while (results.length < 5) {
      results.push({
        url: `https://example.com/mock-${q.id}-${results.length}`,
        title: `${q.query} — related resource ${results.length + 1}`,
        snippet: "Additional mock result for benchmark padding",
        provider: q.expectedProviders[results.length % q.expectedProviders.length] ?? "github",
        finalScore: Math.max(5, 60 - results.length * 8),
        trust: 60 - results.length * 5,
        freshness: 50,
        popularity: 40,
        authority: 55,
        codeQuality: 30,
        hasExamples: 20,
        aiRelevance: 50 - results.length * 5,
        semanticSimilarity: 45 - results.length * 4,
        bm25: 40 - results.length * 3,
        sourceQuality: 50 - results.length * 4,
        spamPenalty: 0,
      });
    }
    mockData.set(q.id, results);
  }
}

buildMocks();

export function getMockResults(queryId: string): RankedResult[] {
  const results = mockData.get(queryId);
  if (!results) return [];
  return results as unknown as RankedResult[];
}

export function getMockSearchOutcome(queryId: string) {
  const results = getMockResults(queryId);
  return {
    traceId: `mock-${queryId}`,
    intent: "programming" as const,
    language: "en",
    providersUsed: [...new Set(results.map((r) => r.provider))],
    results,
    latencyMs: 5,
    degraded: false,
    missingSignals: [] as string[],
    cached: false,
  };
}

export function hasMocks(query: string): boolean {
  return BENCHMARK_QUERIES.some((q) => q.id === query);
}
