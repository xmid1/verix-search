export type RelevanceGrade = "perfect" | "good" | "fair" | "bad" | "miss";

export const RELEVANCE_SCORES: Record<RelevanceGrade, number> = {
  perfect: 3,
  good: 2,
  fair: 1,
  bad: 0,
  miss: -1,
};

export interface JudgedResult {
  url: string;
  title: string;
  grade: RelevanceGrade;
  note?: string;
}

export interface BenchmarkQuery {
  id: string;
  query: string;
  domain: string;
  intent: string;
  newsCategory?: string;
  expectedProviders: string[];
  expectedTopics: string[];
  excludedTopics: string[];
  relevanceJudgments: JudgedResult[];
  notes?: string;
}

export interface BenchmarkResult {
  queryId: string;
  query: string;
  domain: string;
  precisionAt5: number;
  precisionAt10: number;
  recallAt10: number;
  ndcgAt5: number;
  ndcgAt10: number;
  mrr: number;
  mapAt10: number;
  bpref: number;
  providerDiversity: number;
  avgTrustScore: number;
  avgRelevanceScore: number;
  latencyMs: number;
  hasExcludedTopics: boolean;
  deterministicScore: boolean;
  finalScores: number[];
  rerankerAlignment: number;
  degraded: boolean;
  missingSignals: string[];
}

export interface BenchmarkSummary {
  totalQueries: number;
  passedQueries: number;
  failedQueries: number;
  overallScore: number;
  avgPrecisionAt5: number;
  avgPrecisionAt10: number;
  avgNdcgAt5: number;
  avgNdcgAt10: number;
  avgRecallAt10: number;
  avgMrr: number;
  avgMapAt10: number;
  avgBpref: number;
  avgProviderDiversity: number;
  avgTrustScore: number;
  avgRelevanceScore: number;
  avgLatencyMs: number;
  avgRerankerAlignment: number;
  degradedRate: number;
  determinismRate: number;
  excludedTopicViolations: number;
  results: BenchmarkResult[];
  timestamp: string;
  version: string;
  passThresholds: ThresholdViolation[];
}

export interface ThresholdViolation {
  queryId: string;
  metric: string;
  expected: number;
  actual: number;
}

export interface BenchmarkThresholds {
  precisionAt5: number;
  precisionAt10: number;
  ndcgAt5: number;
  ndcgAt10: number;
  mrr: number;
  avgTrustScore: number;
  providerDiversity: number;
  maxLatencyMs: number;
  determinismRequired: boolean;
  excludedTopicPenalty: number;
}

export interface AdversarialTestCase {
  id: string;
  name: string;
  query: string;
  expectedBehavior: string;
  category: "edge" | "malformed" | "extreme" | "security" | "provider";
}

export interface AdversarialTestResult {
  caseId: string;
  name: string;
  passed: boolean;
  latencyMs: number;
  error?: string;
  details?: string;
}

export interface QualityReport {
  summary: BenchmarkSummary;
  adversarialResults: AdversarialTestResult[];
  thresholds: BenchmarkThresholds;
  allPassed: boolean;
  recommendation: "pass" | "warn" | "block";
  version: string;
  runId: string;
  timestamp: string;
}

export interface EnvProfile {
  llmAvailable: boolean;
  hasEmbeddings: boolean;
  providerCount: number;
  isMockMode: boolean;
}

export function detectEnv(): EnvProfile {
  const hasOpenAIKey = !!process.env.OPENCODE_API_KEY;
  return {
    llmAvailable: hasOpenAIKey,
    hasEmbeddings: true,
    providerCount: 28,
    isMockMode: process.argv.includes("--mock"),
  };
}

export function getThresholds(env?: EnvProfile): BenchmarkThresholds {
  const e = env ?? detectEnv();
  const strict = e.llmAvailable && !e.isMockMode;
  return {
    precisionAt5: strict ? 0.6 : 0.4,
    precisionAt10: strict ? 0.5 : 0.3,
    ndcgAt5: strict ? 0.65 : 0.35,
    ndcgAt10: strict ? 0.55 : 0.25,
    mrr: strict ? 0.7 : 0.5,
    avgTrustScore: 65,
    providerDiversity: strict ? 3 : 2,
    maxLatencyMs: 10000,
    determinismRequired: true,
    excludedTopicPenalty: strict ? 0.15 : 0.3,
  };
}

export const DEFAULT_THRESHOLDS: BenchmarkThresholds = getThresholds();

export const DOMAINS = [
  "programming",
  "research_ai",
  "research_security",
  "news_tech",
  "news_cybersecurity",
  "academic",
  "documentation",
  "package",
  "comparison",
  "tutorial",
] as const;

export type Domain = (typeof DOMAINS)[number];
