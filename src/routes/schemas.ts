import { z } from "zod";

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(20).optional(),
});

export const SearchResponseSchema = z.object({
  traceId: z.string(),
  intent: z.string().optional(),
  intentSource: z.string().optional(),
  language: z.string().optional(),
  providersUsed: z.array(z.string()),
  latencyMs: z.number(),
  cached: z.boolean().optional(),
  degraded: z.boolean().optional(),
  missingSignals: z.array(z.string()).optional(),
  results: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      title: z.string(),
      snippet: z.string().optional(),
      provider: z.string(),
      publishedAt: z.string().optional(),
      author: z.string().optional(),
      finalScore: z.number(),
      signals: z.record(z.string(), z.number()),
    })
  ),
});

export const ResearchRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  useCache: z.boolean().optional(),
  depth: z.number().int().min(1).max(5).optional(),
  maxTokens: z.number().int().min(100).max(32000).optional(),
});

export const BatchResearchRequestSchema = z.object({
  questions: z.array(z.string().min(1).max(1000)).min(1).max(20),
  webhookUrl: z.string().url().optional(),
});

export const BatchResearchStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  questions: z.array(z.string()),
  answers: z.array(z.unknown()).optional(),
  errors: z.array(z.string().nullable()).optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export const CitationSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  provider: z.string().optional(),
  trustScore: z.number().optional(),
  snippet: z.string().optional(),
});

export const ResearchResponseSchema = z.object({
  question: z.string(),
  summary: z.string(),
  keyFacts: z.array(z.string()),
  examples: z.array(z.string()),
  warnings: z.array(z.string()),
  codeSnippets: z.array(
    z.object({ language: z.string(), code: z.string(), lines: z.number(), kind: z.string() })
  ),
  citations: z.array(CitationSchema),
  contradictions: z.array(z.record(z.string(), z.unknown())),
  confidence: z.object({
    score: z.number(),
    evidence: z.array(z.string()),
    unknowns: z.array(z.string()),
    weaknesses: z.array(z.string()),
  }),
  reasoningGraph: z
    .array(z.object({ step: z.string(), detail: z.string() }))
    .optional(),
});

export const ExtractRequestSchema = z.object({
  url: z.string().url(),
  schema: z
    .object({
      type: z.literal("object"),
      properties: z.record(z.string(), z.object({ type: z.string(), description: z.string().optional() })),
      required: z.array(z.string()).optional(),
    })
    .optional(),
});

export const ExtractStructuredResponseSchema = z.object({
  url: z.string(),
  title: z.string(),
  structured: z.record(z.string(), z.unknown()),
});

export const CrawlRequestSchema = z.object({
  url: z.string().url().optional(),
  urls: z.array(z.string().url()).min(1).max(20).optional(),
  maxPages: z.number().int().min(1).max(200).optional(),
  sameDomain: z.boolean().optional(),
  includeSitemap: z.boolean().optional(),
  maxDepth: z.number().int().min(1).max(10).optional(),
  excludePatterns: z.array(z.string()).optional(),
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
});

export const RankRequestSchema = z.object({
  query: z.string().min(1),
  candidates: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        title: z.string(),
        snippet: z.string().optional(),
        publishedAt: z.string().optional(),
      })
    )
    .min(1)
    .max(50),
});

export const EmbeddingsRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(50),
});

export const CompressRequestSchema = z.object({
  question: z.string().min(1),
  urls: z.array(z.string().url()).min(1).max(10),
  maxTokens: z.number().int().min(100).max(32000).optional(),
});

export const IssueApiKeySchema = z.object({
  name: z.string().min(1),
  role: z.enum(["ADMIN", "DEVELOPER", "READ_ONLY", "SEARCH_ONLY"]),
  projectId: z.string().optional(),
});

export const VerifyClaimRequestSchema = z.object({
  claim: z.string().min(1).max(2000),
  sourceUrl: z.string().url(),
});

export const VerifyClaimResponseSchema = z.object({
  claim: z.string(),
  sourceUrl: z.string(),
  verdict: z.enum(["supported", "contradicted", "partially_supported", "not_addressed", "source_unreachable"]),
  confidence: z.number(),
  evidence: z.string(),
  evidenceVerified: z.boolean(),
  contradictoryQuote: z.string().optional(),
});

export const WatchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  threshold: z.number().min(0).max(100).optional(),
  webhookUrl: z.string().url(),
  webhookSecret: z.string().optional(),
});

export const WatchResponseSchema = z.object({
  id: z.string(),
  query: z.string(),
  threshold: z.number(),
  webhookUrl: z.string(),
  createdAt: z.string(),
});

export const SearchRequestSchemaExtended = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional(),
  scrape: z.boolean().optional(),
  maxTokens: z.number().int().min(100).max(32000).optional(),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});
