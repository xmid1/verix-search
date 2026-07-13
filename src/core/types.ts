/**
 * Core domain types shared across every module. This is the contract the
 * whole system is built against — search providers, extraction, ranking,
 * planning, and research all speak these types.
 */

export type NewsCategory =
  | "cybersecurity"
  | "technology"
  | "business"
  | "science"
  | "politics"
  | "entertainment"
  | "health"
  | "general";

export type Intent =
  | "programming"
  | "research"
  | "documentation"
  | "package"
  | "github"
  | "security"
  | "debugging"
  | "api"
  | "academic"
  | "news"
  | "general"
  | "comparison"
  | "tutorial"
  | "reference"
  | "architecture";

export type ProviderCategory =
  | "general"
  | "code"
  | "docs"
  | "community"
  | "academic"
  | "package"
  | "news";

export interface ProviderCapabilities {
  category: ProviderCategory;
  requiresApiKey: boolean;
  supportsLanguage?: string[];
  rateLimitPerMinute?: number;
}

export interface SearchQuery {
  raw: string;
  expanded?: string[];
  intent?: Intent;
  intentSource?: "regex" | "llm" | "cache";
  language?: string;
  domainHints?: string[];
  newsCategory?: NewsCategory;
  newsKeywords?: string[];
  entityExpansions?: string[];
  excludeSources?: string[];
  limit?: number;
  traceId: string;
}

export interface SearchResult {
  id: string;
  url: string;
  title: string;
  snippet?: string;
  provider: string;
  publishedAt?: string;
  author?: string;
  raw?: Record<string, unknown>;
}

export interface SearchProvider {
  id: string;
  displayName: string;
  priority: number;
  capabilities(): ProviderCapabilities;
  search(query: SearchQuery): Promise<SearchResult[]>;
  health(): Promise<boolean>;
}

export interface ExtractedCodeBlock {
  language: string;
  code: string;
  lines: number;
  kind: "example" | "production" | "unknown";
}

export interface ExtractedDocument {
  url: string;
  title: string;
  markdown: string;
  textLength: number;
  codeBlocks: ExtractedCodeBlock[];
  publishedAt?: string;
  author?: string;
  metadata: Record<string, unknown>;
  contentHash: string;
}

export interface RankingSignals {
  trust: number;
  freshness: number;
  aiRelevance: number;
  popularity: number;
  codeQuality: number;
  hasExamples: number;
  authority: number;
  spamPenalty: number;
  semanticSimilarity: number;
  bm25: number;
  sourceQuality: number;
}

export interface RankedResult extends SearchResult {
  signals: RankingSignals;
  finalScore: number;
  extracted?: ExtractedDocument;
}

export interface Citation {
  url: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  provider?: string;
  trustScore?: number;
  snippet?: string;
}

export interface Contradiction {
  topic: string;
  claimA: { text: string; source: Citation };
  claimB: { text: string; source: Citation };
  resolution?: "official_wins" | "unresolved";
  note?: string;
}

export interface ConfidenceReport {
  score: number; // 0-100
  evidence: string[];
  unknowns: string[];
  weaknesses: string[];
}

export interface ResearchPlan {
  question: string;
  subQuestions: string[];
  intent: Intent;
  language: string;
  providers: string[];
  domainHints: string[];
}

export interface ResearchAnswer {
  question: string;
  summary: string;
  keyFacts: string[];
  examples: string[];
  warnings: string[];
  codeSnippets: ExtractedCodeBlock[];
  citations: Citation[];
  contradictions: Contradiction[];
  confidence: ConfidenceReport;
  reasoningGraph?: ReasoningGraphNode[];
}

export interface ReasoningGraphNode {
  step:
    | "question"
    | "intent"
    | "sub_questions"
    | "evidence_needed"
    | "provider_selection"
    | "evidence_collection"
    | "conflict_detection"
    | "evidence_weighting"
    | "hypothesis"
    | "verification"
    | "final_answer";
  detail: string;
}

export type StreamEventType =
  | "planning"
  | "searching"
  | "reading"
  | "extracting"
  | "ranking"
  | "comparing"
  | "building_context"
  | "done"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface AuthContext {
  apiKeyId: string;
  role: "ADMIN" | "DEVELOPER" | "READ_ONLY" | "SEARCH_ONLY";
  scopes: string[];
  projectId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Feature 4: Structured Extraction
// ─────────────────────────────────────────────────────────────
export interface StructuredExtractionSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface StructuredExtractionResult {
  url: string;
  title: string;
  markdown: string;
  structured: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Feature 5: Batch Research
// ─────────────────────────────────────────────────────────────
export interface BatchResearchJob {
  id: string;
  questions: string[];
  status: "pending" | "processing" | "completed" | "failed";
  answers: (ResearchAnswer | null)[];
  errors: (string | null)[];
  createdAt: string;
  completedAt?: string;
  webhookUrl?: string;
}

// ─────────────────────────────────────────────────────────────
// Feature 6: Multi-hop Research (depth parameter on ResearchOptions)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Feature 8: Citation Verification
// ─────────────────────────────────────────────────────────────
export type Verdict = "supported" | "contradicted" | "partially_supported" | "not_addressed" | "source_unreachable";

export interface CitationVerification {
  claim: string;
  sourceUrl: string;
  verdict: Verdict;
  confidence: number;
  evidence: string;
  evidenceVerified: boolean;
  contradictoryQuote?: string;
}

// ─────────────────────────────────────────────────────────────
// Feature 9: Watch / Freshness Alerts
// ─────────────────────────────────────────────────────────────
export interface WatchSubscription {
  id: string;
  query: string;
  threshold: number;
  webhookUrl: string;
  webhookSecret?: string;
  lastCheckedAt?: string;
  lastNotifiedAt?: string;
  createdAt: string;
  apiKeyId?: string;
}
