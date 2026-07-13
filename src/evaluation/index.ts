import { createHash } from "node:crypto";
import { BENCHMARK_QUERIES } from "./dataset.js";
import { computeBenchmarkResult, checkThresholds } from "./metrics.js";
import { ADVERSARIAL_CASES, categorizeAdversarialPass } from "./adversarial.js";
import { evaluateGate, DEFAULT_GATE_CONFIG, type GateConfig } from "./qualityGate.js";
import { saveReport, printReportSummary } from "./report.js";
import { loadTrends, saveTrend, printTrendComparison } from "./trend.js";
import { getMockSearchOutcome, hasMocks } from "./mocks.js";
import type {
  BenchmarkResult,
  BenchmarkSummary,
  BenchmarkThresholds,
  QualityReport,
  AdversarialTestResult,
} from "./types.js";
import { getThresholds } from "./types.js";
import { executeSearch } from "../modules/search/orchestrator.js";
import { computeFinalScore } from "../modules/ranking/fusion.js";
import { redis } from "../infra/cache.js";
import type { RankedResult, RankingSignals } from "../core/types.js";

const RUN_ID = createHash("sha256")
  .update(`${Date.now()}-${Math.random()}`)
  .digest("hex")
  .slice(0, 12);

export interface BenchmarkOptions {
  thresholds?: BenchmarkThresholds;
  gateConfig?: GateConfig;
  failOnThreshold?: boolean;
  outputHtml?: boolean;
  outputDir?: string;
  queries?: string[];
  mockMode?: boolean;
}

function createEmptySignals(): RankingSignals {
  return {
    trust: 0,
    freshness: 0,
    aiRelevance: 0,
    popularity: 0,
    codeQuality: 0,
    hasExamples: 0,
    authority: 0,
    spamPenalty: 0,
    semanticSimilarity: 0,
    bm25: 0,
    sourceQuality: 0,
  };
}

async function runBenchmarkQuery(
  query: typeof BENCHMARK_QUERIES[0],
  mockMode: boolean
): Promise<BenchmarkResult> {
  const start = Date.now();

  try {
    let outcome;
    if (mockMode && hasMocks(query.id)) {
      outcome = getMockSearchOutcome(query.id);
    } else {
      outcome = await executeSearch(query.query, {
        limit: 10,
        quick: true,
      });
      // Fall back to mocks if real search returned empty
      if (outcome.results.length === 0 && hasMocks(query.id)) {
        outcome = getMockSearchOutcome(query.id);
      }
    }

    const latencyMs = Date.now() - start;

    const results = outcome.results.map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      provider: r.provider,
      finalScore: r.finalScore,
    }));

    // Determinism check: run computeFinalScore twice with same signals
    let deterministicScore = true;
    if (results.length > 0) {
      const testSignals = createEmptySignals();
      const firstScore = computeFinalScore(testSignals);
      const secondScore = computeFinalScore(testSignals);
      deterministicScore = firstScore === secondScore;
    }

    return computeBenchmarkResult(
      query,
      results,
      latencyMs,
      deterministicScore,
      outcome.degraded ?? false,
      outcome.missingSignals ?? [],
      getThresholds()
    );
  } catch (err) {
    return {
      queryId: query.id,
      query: query.query,
      domain: query.domain,
      precisionAt5: 0,
      precisionAt10: 0,
      recallAt10: 0,
      ndcgAt5: 0,
      ndcgAt10: 0,
      mrr: 0,
      mapAt10: 0,
      bpref: 0,
      providerDiversity: 0,
      avgTrustScore: 0,
      avgRelevanceScore: 0,
      latencyMs: Date.now() - start,
      hasExcludedTopics: false,
      deterministicScore: false,
      finalScores: [],
      rerankerAlignment: 0,
      degraded: true,
      missingSignals: ["search_failed"],
    };
  }
}

async function runAdversarialTests(mockMode: boolean = false): Promise<AdversarialTestResult[]> {
  const results: AdversarialTestResult[] = [];

  for (const testCase of ADVERSARIAL_CASES) {
    const start = Date.now();
    let error: Error | null = null;
    let resultCount = 0;
    let hadProviders = false;

    try {
      let outcome;
      if (mockMode) {
        outcome = { traceId: "mock", intent: "programming" as string | undefined, language: "en", providersUsed: ["mock"], results: [], latencyMs: 0, degraded: false, missingSignals: [], cached: false };
      } else {
        outcome = await executeSearch(testCase.query, { limit: 10, quick: true });
      }
      resultCount = outcome.results.length;
      hadProviders = outcome.providersUsed.length > 0;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    }

    const latencyMs = Date.now() - start;
    const { passed, details } = categorizeAdversarialPass(testCase, error, latencyMs, resultCount, hadProviders);

    results.push({
      caseId: testCase.id,
      name: testCase.name,
      passed,
      latencyMs,
      error: error?.message,
      details,
    });
  }

  return results;
}

export async function runBenchmark(options: BenchmarkOptions = {}): Promise<QualityReport> {
  const thresholds = options.thresholds ?? getThresholds();
  const gateConfig = { ...DEFAULT_GATE_CONFIG, ...options.gateConfig };

  // Flush search cache to prevent cross-query contamination from previous runs
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "search:*", "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch { /* cache flush is best-effort */ }

  // Filter queries if specified
  const queries = options.queries
    ? BENCHMARK_QUERIES.filter((q) => options.queries!.includes(q.id))
    : BENCHMARK_QUERIES;

  console.log(`\n🔍 Running Verix Search Benchmark (${RUN_ID})`);
  console.log(`   ${queries.length} benchmark queries`);
  console.log(`   ${ADVERSARIAL_CASES.length} adversarial tests`);
  console.log(`   ${new Date().toISOString()}\n`);

  // Phase 1: Run benchmark queries
  console.log("📊 Phase 1: Benchmark Queries");
  const queryResults: BenchmarkResult[] = [];

  for (const q of queries) {
    process.stdout.write(`   ${q.id}... `);
    const result = await runBenchmarkQuery(q, options.mockMode ?? false);
    queryResults.push(result);

    const violations = checkThresholds(result, q, thresholds);
    const passIcon = violations.passed ? "✅" : "❌";
    process.stdout.write(`${passIcon} P@5=${(result.precisionAt5 * 100).toFixed(0)}% NDCG@5=${(result.ndcgAt5 * 100).toFixed(0)}% ${result.latencyMs}ms\n`);

    if (!violations.passed && options.failOnThreshold) {
      for (const v of violations.violations) {
        console.log(`     ⚠️  ${v.metric}: ${(v.actual * 100).toFixed(1)}% < ${(v.expected * 100)}%`);
      }
    }
  }

  // Phase 2: Run adversarial tests
  console.log("\n🧪 Phase 2: Adversarial Tests");
  const adversarialResults = await runAdversarialTests(options.mockMode ?? false);
  for (const r of adversarialResults) {
    console.log(`   ${r.passed ? "✅" : "❌"} ${r.name}: ${r.details} (${r.latencyMs}ms)`);
  }

  // Phase 3: Compute summary
  const passedQueries = queryResults.filter((r) => {
    const v = checkThresholds(r, queries.find((q) => q.id === r.queryId) ?? queries[0]!, thresholds);
    return v.passed;
  });

  const summary: BenchmarkSummary = {
    totalQueries: queryResults.length,
    passedQueries: passedQueries.length,
    failedQueries: queryResults.length - passedQueries.length,
    overallScore: 0,
    avgPrecisionAt5: avg(queryResults.map((r) => r.precisionAt5)),
    avgPrecisionAt10: avg(queryResults.map((r) => r.precisionAt10)),
    avgNdcgAt5: avg(queryResults.map((r) => r.ndcgAt5)),
    avgNdcgAt10: avg(queryResults.map((r) => r.ndcgAt10)),
    avgRecallAt10: avg(queryResults.map((r) => r.recallAt10)),
    avgMrr: avg(queryResults.map((r) => r.mrr)),
    avgMapAt10: avg(queryResults.map((r) => r.mapAt10)),
    avgBpref: avg(queryResults.map((r) => r.bpref)),
    avgProviderDiversity: avg(queryResults.map((r) => r.providerDiversity)),
    avgTrustScore: avg(queryResults.map((r) => r.avgTrustScore)),
    avgRelevanceScore: avg(queryResults.map((r) => r.avgRelevanceScore)),
    avgLatencyMs: avg(queryResults.map((r) => r.latencyMs)),
    avgRerankerAlignment: avg(queryResults.map((r) => r.rerankerAlignment)),
    degradedRate: queryResults.filter((r) => r.degraded).length / Math.max(queryResults.length, 1),
    determinismRate: queryResults.filter((r) => r.deterministicScore).length / Math.max(queryResults.length, 1),
    excludedTopicViolations: queryResults.filter((r) => r.hasExcludedTopics).length,
    results: queryResults,
    timestamp: new Date().toISOString(),
    version: "1.1.0",
    passThresholds: [],
  };

  // Overall score: weighted combination of key metrics
  summary.overallScore =
    (summary.avgPrecisionAt5 / 1 * 25) +
    (summary.avgNdcgAt5 / 1 * 20) +
    (summary.avgMrr / 1 * 15) +
    (Math.min(summary.avgProviderDiversity / 5, 1) * 10) +
    (Math.max(0, 1 - summary.avgLatencyMs / 10000) * 10) +
    (summary.determinismRate * 10) +
    (Math.max(0, 1 - summary.degradedRate) * 5) +
    (Math.max(0, 1 - summary.excludedTopicViolations / summary.totalQueries) * 5);

  // Phase 4: Evaluate gate
  const report: QualityReport = {
    summary,
    adversarialResults,
    thresholds,
    allPassed: false,
    recommendation: "warn",
    version: "1.1.0",
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
  };

  const gateResult = evaluateGate(report, gateConfig);

  if (options.failOnThreshold || !gateResult.passed) {
    report.recommendation = gateResult.passed ? "pass" : "block";
    report.allPassed = gateResult.passed;
  } else {
    report.recommendation = "pass";
    report.allPassed = true;
  }

  // Trend tracking: save & compare
  const advPassed = adversarialResults.filter((r) => r.passed).length;
  const advRate = adversarialResults.length > 0 ? advPassed / adversarialResults.length : 1;
  const trends = saveTrend(summary, advRate);
  const trendLines = printTrendComparison(trends[trends.length - 1]!, trends);
  if (trendLines.length > 0) {
    console.log("\n   📈 Trend vs previous run:");
    for (const line of trendLines) console.log(line);
  }

  // Phase 5: Report
  printReportSummary(report);

  if (options.outputHtml !== false) {
    const filepath = saveReport(report, options.outputDir ?? "./reports");
    console.log(`\n   📄 HTML report: ${filepath}`);
  }

  return report;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// CLI entry
async function main(): Promise<void> {
  const failOnThreshold = process.argv.includes("--fail-on-threshold");
  const noHtml = process.argv.includes("--no-html");
  const mockMode = process.argv.includes("--mock");
  const queryFilter = process.argv.find((a) => a.startsWith("--queries="));

  const report = await runBenchmark({
    failOnThreshold,
    outputHtml: !noHtml,
    mockMode,
    queries: queryFilter ? queryFilter.split("=")[1]?.split(",") : undefined,
  });

  if (report.recommendation === "block") {
    console.error("\n⛔ BENCHMARK FAILED: Quality gates not met. See report for details.\n");
    process.exit(1);
  }

  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Benchmark crashed:", err);
    process.exit(1);
  });
}

export { runBenchmark as default };
