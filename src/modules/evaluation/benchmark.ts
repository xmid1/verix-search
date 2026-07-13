/**
 * Internal Evaluation Benchmark.
 *
 * Defines a set of test queries with expected result characteristics and
 * measures how well the search engine performs against them.
 *
 * Scores:
 *  - Precision@5:  how many of top 5 results are on-topic
 *  - Source diversity:  how many different providers appear in top 10
 *  - Relevance score:  average semantic similarity of top 5 results
 *  - Domain authority:  average trust score of top 5 results
 *  - Latency:  response time
 */

export interface BenchmarkQuery {
  query: string;
  expectedTopics: string[];
  expectedProviders?: string[];
  excludeTopics?: string[];
  minScore?: number;
}

export interface BenchmarkResult {
  query: string;
  precisionAt5: number;
  sourceDiversity: number;
  avgRelevance: number;
  avgTrust: number;
  latencyMs: number;
  passed: boolean;
  details: string[];
}

const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  {
    query: "production grade autonomous coding agent with memory tools planning execution self correction",
    expectedTopics: ["agent", "autonomous", "coding", "SWE", "OpenHands"],
    excludeTopics: ["Express", "Django", "deployment", "ATLAS", "LHC", "CMS"],
    expectedProviders: ["arxiv", "github", "semanticscholar"],
  },
  {
    query: "latest cybersecurity competition winners techniques",
    expectedTopics: ["CTF", "cyber", "competition", "security"],
    excludeTopics: ["Trump", "AI order", "China"],
    expectedProviders: ["googlenews", "hackernews"],
  },
  {
    query: "CVE-2024 critical vulnerability exploit",
    expectedTopics: ["CVE", "vulnerability", "exploit"],
    expectedProviders: ["cve", "osv"],
  },
  {
    query: "best way to learn React hooks in 2026",
    expectedTopics: ["React", "hooks"],
    excludeTopics: ["Gemma", "TPU", "burnout", "ATLAS"],
    expectedProviders: ["mdn", "stackexchange", "devto"],
  },
  {
    query: "SWE-agent OpenHands autonomous coding agent comparison",
    expectedTopics: ["SWE", "agent", "coding"],
    expectedProviders: ["arxiv", "github", "semanticscholar"],
  },
  {
    query: "latest AI startup funding news",
    expectedTopics: ["AI", "startup", "funding"],
    expectedProviders: ["googlenews", "rss"],
  },
];

/**
 * Evaluate a single search result against expected topics.
 */
function matchTopics(text: string, topics: string[]): string[] {
  const lower = text.toLowerCase();
  return topics.filter((t) => lower.includes(t.toLowerCase()));
}

/**
 * Run the full benchmark suite against the search engine.
 */
export async function runBenchmark(
  searchFn: (query: string, limit: number) => Promise<{
    results: Array<{ title: string; snippet?: string; provider: string; signals?: { trust: number; semanticSimilarity: number } }>;
    latencyMs: number;
  }>
): Promise<{
  results: BenchmarkResult[];
  overallScore: number;
  passed: number;
  total: number;
}> {
  const results: BenchmarkResult[] = [];

  for (const bq of BENCHMARK_QUERIES) {
    const start = Date.now();
    const response = await searchFn(bq.query, 10);
    const latencyMs = Date.now() - start;

    const top5 = response.results.slice(0, 5);
    const top10 = response.results.slice(0, 10);

    const details: string[] = [];

    // Precision@5: how many top-5 results cover at least one expected topic
    let topicHits = 0;
    for (const r of top5) {
      const text = `${r.title} ${r.snippet ?? ""}`;
      if (matchTopics(text, bq.expectedTopics).length > 0) {
        topicHits++;
      }
    }
    const precisionAt5 = top5.length > 0 ? topicHits / top5.length : 0;
    details.push(`Precision@5: ${topicHits}/5 = ${(precisionAt5 * 100).toFixed(0)}%`);

    // Excluded topic check
    if (bq.excludeTopics) {
      const excludedHits: string[] = [];
      for (const r of top5) {
        const text = `${r.title} ${r.snippet ?? ""}`;
        const matched = matchTopics(text, bq.excludeTopics);
        excludedHits.push(...matched);
      }
      if (excludedHits.length > 0) {
        details.push(`⚠️ Excluded topics in top 5: ${[...new Set(excludedHits)].join(", ")}`);
      }
    }

    // Source diversity
    const providers = new Set(top10.map((r) => r.provider));
    const sourceDiversity = providers.size / Math.max(top10.length, 1);
    details.push(`Source diversity: ${providers.size} providers in top 10`);

    // Expected providers check
    if (bq.expectedProviders) {
      const foundProviders = bq.expectedProviders.filter((p) => providers.has(p));
      const missingProviders = bq.expectedProviders.filter((p) => !providers.has(p));
      if (missingProviders.length > 0) {
        details.push(`⚠️ Missing expected providers: ${missingProviders.join(", ")}`);
      }
      details.push(`Expected providers found: ${foundProviders.length}/${bq.expectedProviders.length}`);
    }

    // Average relevance (semantic similarity) of top 5
    let totalRelevance = 0;
    let relevanceCount = 0;
    for (const r of top5) {
      if (r.signals?.semanticSimilarity !== undefined) {
        totalRelevance += r.signals.semanticSimilarity;
        relevanceCount++;
      }
    }
    const avgRelevance = relevanceCount > 0 ? totalRelevance / relevanceCount : 0;
    details.push(`Avg semantic similarity: ${(avgRelevance * 100).toFixed(1)}%`);

    // Average trust of top 5
    let totalTrust = 0;
    let trustCount = 0;
    for (const r of top5) {
      if (r.signals?.trust !== undefined) {
        totalTrust += r.signals.trust;
        trustCount++;
      }
    }
    const avgTrust = trustCount > 0 ? totalTrust / trustCount : 0;
    details.push(`Avg trust score: ${avgTrust.toFixed(0)}/100`);

    // Pass/fail
    const passed = precisionAt5 >= 0.6;
    results.push({
      query: bq.query.slice(0, 60) + (bq.query.length > 60 ? "..." : ""),
      precisionAt5,
      sourceDiversity,
      avgRelevance,
      avgTrust,
      latencyMs,
      passed,
      details,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const overallScore = results.reduce((s, r) => s + r.precisionAt5, 0) / total;

  return { results, overallScore, passed, total };
}
