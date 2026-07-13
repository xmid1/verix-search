# Verix Search — Strategic Product Roadmap

> A comprehensive strategy document covering product, infrastructure, commercial readiness, and architectural evolution. Organized into three horizons.

---

## Horizon 1: Trust & Quality Foundation (Now — Q3 2025)

### 1.1 Real Agent Feedback Loop

**Problem:** `credibilityGraph` and `sourceMemory` are heuristic-based (domain lists, static scores). They don't learn from actual agent usage.

**Solution:** `POST /v1/feedback`

```json
{
  "traceId": "search_trace_abc123",
  "resultId": "arxiv-2401.00893",
  "signal": "cited",
  "sessionId": "agent_session_xyz"
}
```

| Signal | Meaning | Weight Update |
|--------|---------|---------------|
| `cited` | Agent used this result in output | `+5` to credibility |
| `used` | Agent referenced / clicked | `+2` |
| `rejected` | Agent explicitly ignored / removed | `-3` |
| `reported` | Agent reported low quality | `-10` + human review flag |

**Storage:** New Prisma model `FeedbackSignal`:
```
model FeedbackSignal {
  id         String   @id @default(cuid())
  traceId    String
  resultId   String
  url        String
  signal     String   // cited | used | rejected | reported
  provider   String
  sessionId  String?
  createdAt  DateTime @default(now())
  @@index([url])
  @@index([provider])
}
```

**Integration into ranking:** `src/modules/ranking/credibilityGraph.ts` — add a `feedbackMultiplier` signal:
```typescript
const feedbackScore = await getAggregateFeedback(url);
// -10 to +10, normalized to 0.8x-1.2x multiplier
authoritySignal *= (1 + (feedbackScore / 50));
```

**Why this matters:** Heuristic trust scores (MDN=99, GitHub=96) are static. Real feedback from agents using the API creates a *dynamic* trust surface that improves over time and can't be gamed by SEO.

### 1.2 Query Understanding Debug Endpoint

**Problem:** Developers building agents on top of Verix can't understand *why* a search returned specific results. This generates support tickets.

**Solution:** `POST /v1/debug/plan`

```json
{
  "query": "autonomous software engineering agents 2024 papers"
}
```

**Response:**
```json
{
  "rawQuery": "autonomous software engineering agents 2024 papers",
  "intent": "research",
  "intentSource": "regex",
  "language": "en",
  "newsCategory": null,
  "expandedQueries": [
    "autonomous software engineering agents 2024 papers",
    "SWE-agent OpenHands Devin autonomous software engineering agents"
  ],
  "entityExpansions": ["SWE-agent", "OpenHands", "Devin"],
  "excludeSources": ["mdn", "devto"],
  "selectedProviders": ["arxiv", "github", "semanticscholar", "wikipedia", "brave", "reddit"],
  "planningLatencyMs": 850
}
```

**Implementation:** `src/routes/debug.ts` — calls `buildSearchPlan()` directly (from `src/modules/planner/index.ts`) without executing any provider search.

**Why this matters:** Every major API platform has a debug endpoint. It reduces support burden and helps developers optimize their queries. It's also 50 lines of code.

### 1.3 Adaptive Provider Selection

**Problem:** `selectProviders()` uses static intent→provider mappings. Brave might always be first for "news", but if SemanticScholar consistently returns better results for academic queries, the system should learn this.

**Solution:** Track provider effectiveness per intent over time.

**Data collected (in Search Prisma model):**
```typescript
// New fields on Search model
avgFinalScoreByProvider: Json   // { "arxiv": 88.5, "github": 72.3, ... }
providerResultCounts: Json      // { "arxiv": 1, "github": 4, ... }
}

// Aggregated weekly:
//   providerPerformance: { intent: "research", provider: "arxiv", avgScore: 85, sampleCount: 120 }
```

**Integration:** In `src/modules/planner/providerSelection.ts`, add a `providerScoreBoost` map:
```typescript
const boost = await getProviderBoostForIntent(intent, provider.id);
// 0.0-0.3 added to priority, used as soft tiebreaker within same category
```

**Why this matters:** Static provider selection is fragile. Adaptive selection naturally responds to provider outages, API changes, and shifting content quality without manual reconfiguration.

---

## Horizon 2: Commercial Readiness (Q3-Q4 2025)

### 2.1 Usage Analytics Dashboard

**Why:** Before you can sell API access, you need to understand how it's being used.

**MVP (internal only, simple JSON endpoint + static HTML):**

`GET /v1/admin/analytics?days=30`

**Response:**
```json
{
  "totalRequests": 45230,
  "requestsByEndpoint": {
    "/v1/search": 28100,
    "/v1/research": 8900,
    "/v1/extract": 7200,
    "/v1/compress": 1030
  },
  "requestsByApiKey": [
    { "prefix": "vx_live_ab12", "count": 15000, "degradedRate": 0.03 },
    { "prefix": "vx_live_cd34", "count": 8900, "degradedRate": 0.12 }
  ],
  "intentDistribution": {
    "programming": 0.35,
    "research": 0.28,
    "documentation": 0.18,
    "academic": 0.12,
    "news": 0.07
  },
  "avgSearchLatencyMs": 2450,
  "p50SearchLatencyMs": 1800,
  "p95SearchLatencyMs": 7200,
  "degradedRequestRate": 0.04,
  "topProvidersByUsage": ["github", "wikipedia", "brave", "arxiv"],
  "avgResultsPerSearch": 8.2,
  "cacheHitRate": 0.31
}
```

**Implementation:** Aggregate from existing Prisma `Search` and `ResearchSession` models. Add a `RequestLog` model if finer granularity is needed.

**Future:** Build a simple React dashboard or expose via Grafana + Prometheus (already instrumented).

### 2.2 Tiered Rate Limiting

**Why:** Without usage-based limits, you can't offer paid plans. The Redis rate limiter already exists — it just needs configurable tiers.

**Implementation:**

```typescript
// src/plugins/rateLimit.ts — enhanced
const TIERS = {
  free: { requestsPerMinute: 10, maxResults: 5, researchDepth: 1, concurrentJobs: 1 },
  pro: { requestsPerMinute: 120, maxResults: 20, researchDepth: 3, concurrentJobs: 5 },
  enterprise: { requestsPerMinute: 1000, maxResults: 50, researchDepth: 5, concurrentJobs: 50 },
};
```

**Integration with RBAC:**
```typescript
// ApiKey model already has role field
// New: ApiKey.tier field: "free" | "pro" | "enterprise"
// Rate limit middleware reads: const tier = apiKey.tier ?? "free";
// Then applies TIERS[tier].requestsPerMinute
```

**Why this matters:** This is the direct prerequisite for monetization. The infrastructure (Redis rate limiting, RBAC) exists — it just needs the tier abstraction layer.

### 2.3 Evaluation Benchmark as CI Gate

**Why:** The `benchmark.ts` file exists but is informational. Making it a CI gating mechanism prevents regressions like the react.dev hijacking from reaching production.

**Implementation:**

```typescript
// src/evaluation/benchmark.ts — enhanced with thresholds
const THRESHOLDS = {
  precisionAt5: { min: 0.6 },      // At least 60% of top-5 must be relevant
  sourceDiversity: { min: 3 },      // At least 3 different providers in top-10
  avgTrust: { min: 70 },            // Average trust score ≥ 70
  avgRelevance: { min: 0.5 },       // Average semantic similarity ≥ 0.5
  maxDeployLatency: { max: 5000 },  // Search must complete in <5s
  determinism: { required: true },  // computeFinalScore must be deterministic
};
```

**CI Integration (`.github/workflows/ci.yml`):**
```yaml
- name: Run evaluation benchmark
  run: npx tsx src/evaluation/benchmark.ts --fail-on-threshold
```

If `--fail-on-threshold` is set, the script exits with code 1 if any threshold is not met, blocking the PR.

**Why this matters:** Without automated quality gating, every refactor risks regressing hard-won fixes. This is standard practice at every production search team (Google, Bing, Elastic).

---

## Horizon 3: Architectural Evolution (Q4 2025+)

### 3.1 Multi-Modal Search

**Current:** Text queries → text results.

**Future:**
- **Image input**: "Find diagrams of SWE-agent architecture" → reverse image search + text results
- **Code input**: "fix this bug" → paste code snippet → search for similar bugs + fixes
- **Audio input**: Whisper transcription → search

**Lowest-effort entry point:** Accept `query` as `string | { text?: string; imageUrl?: string; code?: string }` and route to appropriate providers.

### 3.2 Personalization Per API Key

**Current:** Every search is stateless — same query, same results for everyone.

**Future:** 
- Per-key source preferences (`excludeSources: ["medium", "devto"]`)
- Per-key domain boost (my startup → my docs rank higher)
- Per-key language preference (Arabic query → prefer Arabic results)

**Implementation:** Store preferences in ApiKey metadata JSON field. Apply as additional signals during ranking.

### 3.3 Real-Time Collaborative Research

**Current:** Research is single-user.

**Future:** Multiple agents (or agent + human) can subscribe to the same `researchSession`. When one agent finds a new source, all subscribers get a delta. Like Google Docs for research.

**Implementation:** WebSocket room per `researchSession`. Each `extractDocument` call emits a `new_source` event to the room. Agent receives: `{ event: "new_source", url: "...", title: "...", summary: "..." }`.

### 3.4 Webhook Chaining / Pipelines

**Current:** Webhooks fire a single URL.

**Future:** Webhook chains — when crawl completes, trigger research on extracted content, then trigger compress on research results, then webhook the final answer.

**Implementation:** `webhookChain: [{ event: "crawl.complete", endpoint: "/v1/research", mapping: {...} }, { event: "research.complete", ... }]`. Each step in the chain is a Verix API call with a mapping from the previous step's output to the next step's input.

### 3.5 Federated Provider Protocol

**Current:** All providers are hardcoded in `src/modules/providers/`.

**Future:** Provider plugin system — third parties can write Verix-compatible providers and register them via config:
```json
{
  "customProviders": [
    {
      "id": "my-internal-docs",
      "url": "https://search.mycompany.com/verix-bridge",
      "auth": "Bearer xxx"
    }
  ]
}
```

The provider implements a simple HTTP API (`POST /verix-bridge` with a `SearchQuery`, returns `SearchResult[]`). Verix treats it as a first-class provider in ranking and dedup.

---

## Commercial Positioning

### Competitive Differentiation Matrix

| Feature | Verix | Exa | Tavily | Firecrawl | Perplexity API |
|---------|-------|-----|--------|-----------|----------------|
| Multi-provider search | ✅ 27 providers | ❌ (own index) | ❌ (own index) | ❌ | ❌ (own index) |
| 11-signal ranking | ✅ | ❌ | ❌ | ❌ | ❌ |
| Deep research | ✅ | ✅ (RAG) | ❌ | ❌ | ✅ |
| Multi-hop research | ✅ | ❌ | ❌ | ❌ | ❌ |
| Structured extraction | ✅ | ✅ | ❌ | ✅ | ❌ |
| Citation verification | ✅ | ❌ | ❌ | ❌ | ❌ |
| Context budget (`maxTokens`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Freshness alerts | ✅ | ❌ | ❌ | ❌ | ❌ |
| Batch research | ✅ | ❌ | ❌ | ❌ | ❌ |
| Content extraction | ✅ | ❌ | ❌ | ✅ | ❌ |
| Open source provider plugin | ❌ *planned* | ❌ | ❌ | ❌ | ❌ |
| Agent feedback loop | ❌ *planned* | ❌ | ❌ | ❌ | ❌ |
| Usage analytics | ❌ *planned* | ✅ | ❌ | ✅ | ❌ |

### Pricing Strategy Suggestion

| Tier | Price | Limits | Key Differentiators |
|------|-------|--------|---------------------|
| **Free** | $0 | 100 req/day, limit 5, depth 1 | Try before buying |
| **Pro** | $49/mo | 10K req/mo, limit 20, depth 3, batch 10 | Individual developers |
| **Team** | $199/mo | 100K req/mo, limit 50, depth 5, batch 50, analytics | Small teams building agents |
| **Enterprise** | Custom | Unlimited, SLA, dedicated infra, SSO, custom providers | Production agent platforms |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM cost explosion (multi-hop depth >3) | High | High | Hard cap at depth=2 in free tier; per-hop cost estimate in response |
| Evidence hallucination (verify-claim) | Medium | Critical | `evidenceVerified` substring check; conservative LLM prompting |
| Provider API changes breaking search | High | High | Health checks + graceful degradation per provider |
| Redis data loss (watch subscriptions) | Medium | Medium | PostgreSQL persistence for v2; TTL warnings in current docs |
| Cache poisoning via deterministic caching | Low | Medium | SHA-256 cache keys scope to query+limit+quick (no user data) |
| Rate limit bypass via API key sharing | Medium | High | Rate limiting per-key, not per-IP; anomaly detection in analytics |
| BM25 corpus-dependent score changes | Low | Low | Documented behavior; "identical sets → identical scores" guarantee |

---

## Quick Wins (Implementable in <3 days each)

| # | Feature | Effort | Impact | Dependencies |
|---|---------|--------|--------|-------------|
| 1 | Debug endpoint (`/v1/debug/plan`) | 4h | High (reduces support) | `buildSearchPlan` already exists |
| 2 | CI benchmark gating | 4h | High (prevents regressions) | `benchmark.ts` already exists |
| 3 | Tiered rate limiting | 1d | High (monetization prerequisite) | Redis rate limiting exists |
| 4 | Feedback endpoint (`/v1/feedback`) | 1d | Medium (data collection starts) | New Prisma model |
| 5 | Usage analytics endpoint | 1d | Medium (visibility) | Prisma aggregation queries |
| 6 | Webhook HMAC signature | 4h | Medium (security) | `crypto.createHmac` built-in |
