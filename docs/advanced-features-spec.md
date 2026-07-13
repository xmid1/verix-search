# Advanced Features — Implementation Specification

> **Verix Search v1.1.0** — Six agent-native features organized by implementation order (simplest + highest impact first, most complex last).

---

## Implementation Order

| # | Feature | Est. Effort | Risk | Impact |
|---|---------|-------------|------|--------|
| 1 | Context Budget Awareness (`maxTokens`) | 1 day | Low | High — differentiator vs human search engines |
| 2 | Structured Extraction with Schema | 1 day | Low | High — matches Firecrawl/Exa parity |
| 3 | Batch Async Research | 2 days | Medium | High — enables parallel agent workflows |
| 4 | Citation Verification | 2 days | Medium | Critical — agent trust/safety feature |
| 5 | Freshness-Sensitive Alerts | 2 days | Medium | Medium — sticky retention feature |
| 6 | Multi-Hop Recursive Research | 3 days | High | High — most complex, highest value |

---

## Feature 1: Context Budget Awareness

### Problem

Current `/v1/search` and `/v1/compress` accept `limit` (max results). But LLM agents think in tokens, not result counts. An agent with a 4000-token context window needs the system to maximize information density within that budget — not just return N results and hope they fit.

### API Change

#### POST /v1/search — new `maxTokens` field

```json
{
  "query": "autonomous software engineering agents 2024",
  "maxTokens": 4000,
  "scrape": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxTokens` | number | _not set_ | Context budget (100-32000). When set, overrides priority of `limit` — system computes optimal result count + per-result snippet length. |

#### POST /v1/compress — new `maxTokens` field

```json
{
  "question": "How does SWE-agent work?",
  "urls": ["https://arxiv.org/abs/2401.00893"],
  "maxTokens": 2000
}
```

Same semantics: system truncates each source document to fit within the aggregate budget.

#### POST /v1/research — new `maxTokens` field

```json
{
  "question": "What are the differences between SWE-agent and Devin?",
  "depth": 1,
  "maxTokens": 8000
}
```

Truncates the final answer (`summary`, `keyFacts`, `examples`, `warnings`) to fit within the budget.

### Internal Design

#### Token Estimation (`src/modules/compression/tokenBudget.ts`)

```
TOKENS_PER_CHAR = 0.25  (≈ 4 chars/token, GPT-4/Claude compatible)
BASE_OVERHEAD = 50      (JSON keys, response envelope)

computeTokenBudget(maxTokens):
  available = maxTokens - BASE_OVERHEAD
  charsPerResult = min(2000, available / TOKENS_PER_CHAR)
  maxResults = min(available / (charsPerResult × TOKENS_PER_CHAR), 20)
  return { maxResults, maxCharsPerResult, maxTotalChars }
```

#### Integration points

| Endpoint | File | Integration |
|----------|------|-------------|
| `/v1/search` | `src/routes/search.ts` | Before `executeSearch`, scale `limit` down to `budget.maxResults`. After response, use `truncateToBudget` to trim results. |
| `/v1/compress` | `src/routes/compress.ts` | Before extraction, restrict `urls` to `budget.maxResults`. During extraction, truncate each `markdown` to `budget.maxCharsPerResult × 4`. |
| `/v1/research` | `src/routes/research.ts` | After answer assembled, estimate tokens via `estimateAnswerTokens()`. If over budget, truncate `summary` and cap `keyFacts`/`examples`. |

### Critical Points

- **Token counting is approximate**: 0.25 chars/token is conservative. Claude uses ~3.7 chars/token for English, ~1.5 for code. The estimate is intentionally generous (slightly over-counts) to prevent unexpected truncation.
- **`limit` vs `maxTokens`**: If both are provided, `maxTokens` wins for per-result sizing but `limit` acts as an absolute upper bound on result count.
- **No LLM call for tokenization**: We avoid calling `tiktoken` or similar to keep latency under 1ms. The heuristic estimate is sufficient for a context budget hint.

---

## Feature 2: Structured Extraction with JSON Schema

### Problem

Standard extraction returns raw Markdown. Agent builders need structured data — pricing tables, product specs, article metadata, contact info — without post-processing LLM calls. Firecrawl and Exa already offer this; it's the #1 request from agent builders.

### API Change

#### POST /v1/extract — new optional `schema` field

```json
{
  "url": "https://pricing.example.com",
  "schema": {
    "type": "object",
    "properties": {
      "plan_name": { "type": "string", "description": "Name of the pricing plan" },
      "monthly_price": { "type": "number", "description": "Monthly price in USD" },
      "annual_price": { "type": "number", "description": "Annual price in USD" },
      "features": { "type": "array", "description": "List of features included" },
      "limitations": { "type": "array", "description": "List of limitations or caveats" }
    },
    "required": ["plan_name", "monthly_price"]
  }
}
```

#### Response — when schema is provided

```json
{
  "url": "https://pricing.example.com",
  "title": "Pricing Plans — Example Corp",
  "markdown": "# Pricing\n\n## Pro Plan\n$29/month...",
  "structured": {
    "plan_name": "Pro Plan",
    "monthly_price": 29,
    "annual_price": 290,
    "features": ["Unlimited projects", "Team collaboration", "API access", "Priority support"],
    "limitations": ["Max 10 team members", "No custom branding"]
  }
}
```

When no schema is provided, behavior is unchanged (returns markdown-only).

### Internal Design

#### Pipeline (`src/modules/extraction/structured.ts`)

```
extractStructured(doc: ExtractedDocument, schema: JSONSchema)
  → Prompt LLM with document markdown + schema description
  → chatJSON() returns Record<string, unknown>
  → Validate returned fields match schema types
  → Return StructuredExtractionResult { url, title, markdown, structured }
```

#### LLM Prompt Strategy

```
Extract structured data from the following document according to this schema:

Schema: {JSON.stringify(schema, null, 2)}

Properties to extract:
  "plan_name" (string): Name of the pricing plan
  "monthly_price" (number): Monthly price in USD
  ...

Document content:
{markdown.slice(0, 8000)}

Return a JSON object with ONLY the properties defined in the schema.
Use null for missing values. No extra fields.
```

### Critical Points

- **Content window**: We cap source text at 8000 chars to keep LLM calls fast and cheap. For pages larger than this, the extraction quality may degrade. Future improvement: chunk-and-summarize for very long pages.
- **Schema validation**: After LLM extraction, we validate that returned types match schema types (string, number, boolean, array). Mismatches are coerced where possible (e.g., `"29"` → `29`).
- **Null vs missing**: Missing values use `null`, not omitted keys. This makes consumer-side processing deterministic.
- **No hallucinated data guard**: The LLM is instructed to use `null` for missing values. No mechanism beyond prompting prevents fabrication — this is acceptable because structured extraction is inherently a "best effort" feature (unlike citation verification which requires hallucination protection).

---

## Feature 3: Batch Async Research

### Problem

`/v1/research` takes 7-12 seconds per question (synchronous). Agents that need to research multiple questions must either wait sequentially or fire parallel requests. Both approaches block the agent or create complexity. A batch endpoint with BullMQ background processing and webhook delivery solves this.

### API Change

#### New endpoint: `POST /v1/research/batch`

```json
{
  "questions": [
    "What is SWE-agent and how does it work?",
    "How does Devin by Cognition Labs work?",
    "What is the ReAct paradigm in LLM agents?",
    "How does Reflexion agent framework work?"
  ],
  "webhookUrl": "https://my-agent.example.com/webhooks/research-complete"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `questions` | string[] | ✅ | 1-20 research questions (each 1-1000 chars) |
| `webhookUrl` | string | ❌ | HTTPS endpoint called on completion |

#### Response (immediate)

```json
{
  "jobId": "abc123def456"
}
```

#### Polling: `GET /v1/research/batch/:jobId`

```json
{
  "jobId": "abc123def456",
  "status": "completed",
  "questions": ["What is SWE-agent?", ...],
  "answers": [
    { "summary": "SWE-agent is...", "confidence": { "score": 88 }, ... },
    { "summary": "Devin is...", "confidence": { "score": 82 }, ... },
    null,
    { "summary": "Reflexion is...", "confidence": { "score": 75 }, ... }
  ],
  "errors": [null, null, "LLM service unavailable", null],
  "createdAt": "2025-03-15T10:00:00Z",
  "completedAt": "2025-03-15T10:02:30Z"
}
```

Status: `pending` → `processing` → `completed` | `failed`.

### Internal Design

#### Job lifecycle

```
POST /v1/research/batch
  → createBatchJob(questions, webhookUrl)
    → Generate nanoid
    → Store BatchResearchJob in Redis (TTL: 86400s = 24h)
    → Enqueue bullmq job on "batch-research" queue
    → Return { jobId }

Worker processes job:
  → Read BatchResearchJob from Redis
  → Set status = "processing"
  → Promise.allSettled(questions.map(q => runDeepResearch(q, { useCache: true })))
  → For each result:
      fulfilled → store in answers[i], errors[i] = null
      rejected  → answers[i] = null, errors[i] = reason.message
  → Set status = "completed", completedAt = now
  → If webhookUrl: POST { batchId, status, answers, errors } with 10s timeout

GET /v1/research/batch/:jobId
  → Read from Redis, return or 404
```

#### Files

| File | Role |
|------|------|
| `src/modules/research/batch.ts` | `createBatchJob`, `getBatchJob`, `processBatchJob` |
| `src/routes/batch-research.ts` | `POST /v1/research/batch`, `GET /v1/research/batch/:jobId` |
| `src/workers/index.ts` | Handler for `batch-research` queue → calls `processBatchJob` |
| `src/infra/queue.ts` | Queue name `"batch-research"` added to `QUEUE_NAMES` |

### Webhook Payload

```json
POST https://my-agent.example.com/webhooks/research-complete
Content-Type: application/json

{
  "event": "batch-research.completed",
  "jobId": "abc123def456",
  "status": "completed",
  "answers": [ ... ],
  "errors": [null, null, "LLM service unavailable", null]
}
```

### Critical Points

- **Partial failure is explicit**: `answers[i]` is `null` where `errors[i]` is non-null. Consumers iterate via `zip(answers, errors)`.
- **Redis persistence**: Jobs expire after 24h. If Redis restarts, incomplete jobs are lost. A future improvement would add Prisma persistence.
- **No retry on individual question failure**: Each question is tried once. Retry logic at the BullMQ level applies to the batch as a whole (e.g., if the worker crashes mid-batch).
- **Concurrency**: `Promise.allSettled` runs all questions in parallel. For 20 questions with 10s each, worst-case latency is ~12s (limited by `runDeepResearch`'s global timeout, not the batch).

---

## Feature 4: Citation Verification

### Problem

LLM agents frequently hallucinate citations — claiming a source supports a claim when it doesn't. Before an agent cites a source in its output, it needs to verify that the source actually contains the claimed information. This is a trust/safety-critical feature that differentiates Verix from any standard search API.

### API Change

#### New endpoint: `POST /v1/verify-claim`

```json
{
  "claim": "SWE-agent achieves a 12.3% resolution rate on the SWE-bench benchmark",
  "sourceUrl": "https://arxiv.org/abs/2401.00893"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `claim` | string | ✅ | The claim to verify (1-2000 chars) |
| `sourceUrl` | string | ✅ | URL to extract and check |

#### Response

```json
{
  "claim": "SWE-agent achieves a 12.3% resolution rate on the SWE-bench benchmark",
  "sourceUrl": "https://arxiv.org/abs/2401.00893",
  "verdict": "supported",
  "confidence": 95,
  "evidence": "SWE-agent achieves a 12.3% resolution rate on SWE-bench",
  "evidenceVerified": true,
  "contradictoryQuote": null
}
```

### Verdict States

| Verdict | Meaning | Agent Action | Confidence Range |
|---------|---------|-------------|-----------------|
| `supported` | Source explicitly supports the claim with direct evidence | Cite with confidence | 70-100 |
| `contradicted` | Source explicitly contradicts the claim | Flag contradiction; do not cite | 70-100 |
| `partially_supported` | Source supports part but not all, or indirect | Cite with caveats | 30-69 |
| `not_addressed` | Source does not mention the claim or topic | Do not cite; seek other sources | 0 |
| `source_unreachable` | URL could not be fetched or extracted | Retry or skip | 0 |

### Anti-Hallucination Protection

After the LLM returns an `evidence` string, the system performs a **programmatic substring check**:

```typescript
const evidenceVerified = sourceText.includes(result.evidence);
```

- If `evidenceVerified === true`: The quote is confirmed as a verbatim substring of the actual source content. Consumers can display it as a real quote.
- If `evidenceVerified === false`: The LLM may have paraphrased or fabricated. The evidence field is prefixed with `[LLM-suggested evidence not verified in source text]` to warn consumers.

If the LLM returns `verdict: "not_addressed"` or `"source_unreachable"`, `evidenceVerified` is always `false` because no source text check applies.

### Internal Design

#### Pipeline (`src/modules/verification/index.ts`)

```
verifyClaim(claim, sourceUrl)
  → extractDocument(sourceUrl)
    → if fetch fails: return { verdict: "source_unreachable", ... }
  → Build LLM prompt with claim + sourceText.slice(0, 8000)
  → chatJSON() returns { verdict, confidence, evidence, contradictoryQuote }
  → sourceText.includes(evidence) ? evidenceVerified = true : false
  → Return CitationVerification
```

#### LLM Prompt (condensed)

```
You are a citation verification system. Determine how the provided
source relates to the given claim.

Verdict definitions:
- "supported": Source explicitly supports the claim with direct evidence
- "contradicted": Source explicitly contradicts the claim
- "partially_supported": Source supports part but not all, or indirect
- "not_addressed": Source does not mention the claim or topic at all

"evidence" MUST be an EXACT verbatim quote from the source content.
Do not paraphrase or fabricate.

Rules:
- If no exact quote supports the verdict, use "not_addressed"
- Conservative: uncertain → "partially_supported"
```

### Critical Points

- **Evidence hallucination is the #1 risk**: The LLM's strongest failure mode is fabricating a plausible-sounding quote. The substring check catches this but is fragile (whitespace, punctuation differences). A future improvement: normalize both strings before comparison (strip whitespace, normalize unicode).
- **Source content is limited**: We only pass 8000 chars to the LLM. If the relevant evidence is beyond this window, the verdict will be `not_addressed` even if the source supports the claim. Future improvement: chunked extraction with relevance scoring.
- **Conservative bias**: The LLM is instructed to prefer `partially_supported` over `supported` when uncertain. This means false negatives are more likely than false positives — the safer trade-off for citation verification.
- **`source_unreachable` is not retried**: If extraction fails (404, timeout, blocked), the verdict is final. A future improvement: exponential backoff retry or alternative extraction method (e.g., textise dot iitty).

---

## Feature 5: Freshness-Sensitive Alerts

### Problem

Agents need to monitor topics over time — new papers, product launches, security disclosures. Polling `/v1/search` is wasteful and misses results between checks. A subscription-based system with background monitoring and webhook delivery solves this.

### API Change

#### New endpoint: `POST /v1/watch`

```json
{
  "query": "SWE-agent SWE-bench new papers 2025",
  "threshold": 75,
  "webhookUrl": "https://my-agent.example.com/webhooks/new-results",
  "webhookSecret": "optional-secret-for-verification"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | Search query to monitor (1-500 chars) |
| `threshold` | number | ❌ | Minimum `finalScore` (0-100) to trigger alert. Default: 70. |
| `webhookUrl` | string | ✅ | HTTPS endpoint called with new results |
| `webhookSecret` | string | ❌ | Sent as `X-Webhook-Secret` header |

#### Response

```json
{
  "id": "watch_abc123",
  "query": "SWE-agent SWE-bench new papers 2025",
  "threshold": 75,
  "webhookUrl": "https://my-agent.example.com/webhooks/new-results",
  "createdAt": "2025-03-15T10:00:00Z"
}
```

#### Management endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/watch/:id` | Get subscription details |
| `DELETE` | `/v1/watch/:id` | Delete subscription |

### Threshold Scale

- **Scale**: 0-100, matching `finalScore` exactly.
- **Guidance**: 
  - `≥80`: Highly relevant, low noise.
  - `60-79`: Moderately relevant, some noise.
  - `40-59`: Low relevance, high noise.
  - `<40`: Likely irrelevant.
- **Default**: 70 (catches high-quality results without drowning in noise).

### Webhook Payload

```json
POST https://my-agent.example.com/webhooks/new-results
Content-Type: application/json
X-Webhook-Secret: optional-secret

{
  "event": "watch.alert",
  "subscriptionId": "watch_abc123",
  "query": "SWE-agent SWE-bench new papers 2025",
  "newResults": [
    {
      "url": "https://arxiv.org/abs/2503.12345",
      "title": "SWE-ABS: Automated Bug Squashing with Language Models",
      "snippet": "We present SWE-ABS, a new approach to automated bug fixing...",
      "provider": "arxiv",
      "publishedAt": "2025-03-14T00:00:00Z",
      "finalScore": 89.5
    }
  ],
  "checkedAt": "2025-03-15T10:00:00Z"
}
```

### Internal Design

#### Subscription lifecycle (`src/modules/watch/index.ts`)

```
POST /v1/watch
  → createWatchSubscription(query, threshold, webhookUrl, secret, apiKeyId)
    → Generate nanoid
    → Store WatchSubscription in Redis (TTL: 30 days)
    → Enqueue recurring BullMQ job on "watcher" queue (repeat: 1h)
    → Return { id }

GET /v1/watch/:id
  → Read from Redis, return or 404

DELETE /v1/watch/:id
  → Delete from Redis, return { deleted: true }
```

#### Check lifecycle (worker)

```
checkWatchSubscription(subscriptionId)
  → Read subscription from Redis
  → executeSearch(query, { limit: 10, quick: true })
  → Filter results:
      publishedAt > lastCheckedAt  (new since last check)
      && finalScore >= threshold   (relevant enough)
  → Update lastCheckedAt = now
  → If any new results:
      → Update lastNotifiedAt
      → POST to webhookUrl with newResults
  → Store updated subscription back to Redis
```

#### Files

| File | Role |
|------|------|
| `src/modules/watch/index.ts` | `createWatchSubscription`, `getWatchSubscription`, `deleteWatchSubscription`, `checkWatchSubscription` |
| `src/routes/watch.ts` | `POST /v1/watch`, `GET /v1/watch/:id`, `DELETE /v1/watch/:id` |
| `src/workers/index.ts` | Handler for `watcher` queue → calls `checkWatchSubscription` |
| `src/infra/queue.ts` | Queue name `"watcher"` added to `QUEUE_NAMES` |

### Critical Points

- **Only checks new-by-date**: We use `publishedAt` to determine "new." This misses results without dates or with incorrect dates. A fallback comparison using `lastCheckedAt` as a naive "seen before" gate is missing — future improvement: track contentHash of seen results.
- **One-hour check interval**: Hardcoded as `repeat: { every: 3600000 }`. For time-sensitive use cases (security disclosures, news), 1h may be too slow. Future: make interval configurable per subscription.
- **Redis-only storage**: Subscriptions expire after 30 days. A future production version should persist to PostgreSQL. The Redis-first approach is acceptable for v1 but means subscriptions are lost on Redis restart.
- **No dedup across checks**: If the same result appears in two consecutive checks (e.g., due to `publishedAt` being the start of the day), it triggers two alerts. Future: maintain a set of seen contentHashes.

---

## Feature 6: Multi-Hop Recursive Research

### Problem

Standard `/v1/research` generates sub-questions once, searches them, and produces an answer. But the `confidence.unknowns` field often reveals knowledge gaps that the first pass couldn't fill. Multi-hop research closes these gaps by recursively generating new sub-questions from the unknowns and researching them.

### API Change

#### POST /v1/research — new optional `depth` field

```json
{
  "question": "How does SWE-agent compare to Devin for automated bug fixing?",
  "depth": 2,
  "useCache": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `depth` | number | ❌ | Recursion depth (1-5). Default: 1 (single pass). Each hop costs ~8-15s. Depth 2 costs ~20-30s total. Depth 3 is ~40-60s. |

#### Response (same shape as standard research)

The `reasoningGraph` includes hop indicators:
```json
{
  "reasoningGraph": [
    { "step": "question", "detail": "How does SWE-agent compare to Devin?" },
    { "step": "intent", "detail": "Depth 1/2" },
    { "step": "sub_questions", "detail": "SWE-agent capabilities | Devin architecture benchmarks" },
    { "step": "evidence_collection", "detail": "5 total sources across 1 hop(s)" },
    { "step": "verification", "detail": "3 unknowns found, recursing" },
    { "step": "intent", "detail": "Depth 2/2" },
    { "step": "sub_questions", "detail": "Devin internal agent loop | SWE-agent ACI design details" },
    { "step": "evidence_collection", "detail": "9 total sources across 2 hop(s)" },
    { "step": "final_answer", "detail": "Multi-hop answer assembled" }
  ],
  "confidence": {
    "score": 88,
    "unknowns": [],
    "weaknesses": []
  }
}
```

### How it Differs from the Existing Sub-Question Approach

| Aspect | Standard (depth=1) | Multi-hop (depth>1) |
|--------|-------------------|---------------------|
| Sub-question generation | One-time, from initial question | Recurring: initial + from unknowns |
| Source freshness | Single pass | Cumulative across hops |
| Unknowns handling | Reported in confidence | Investigated via new sub-questions |
| Guaranteed depth | No | Yes, up to `depth` |
| Termination condition | After all sub-questions done | Depth exhausted OR no unknowns remain |

### Internal Design

#### Recursive Pipeline (`src/modules/research/multihop.ts`)

```
runMultiHopResearch(question, depth, opts)
  → Initialize MultiHopContext { question, depth, depth=0, sources[], unknowns[], reasoningGraph }
  → return recurseResearch(ctx, opts)

recurseResearch(ctx):
  → Standard research plan (buildResearchPlan)
  → executeSearch for each sub-question (same as standard)
  → extractDocument for each new result
  → Accumulate into ctx.accumulatedSources (with dedup by URL)
  → synthesizeAnswer from accumulated sources
  → computeConfidence → ctx.unknowns = confidence.unknowns
  
  → If ctx.currentDepth < ctx.depth - 1 && ctx.unknowns.length > 0:
      → Generate sub-questions from unknowns via LLM
      → ctx.currentDepth++
      → Recurse
    
  → Else: return final answer
```

#### Sub-Question Generation from Unknowns

```typescript
async function generateSubQuestions(originalQuestion: string, unknowns: string[]): Promise<string[]> {
  // Prompt LLM to convert unknowns into searchable sub-questions
  // Returns 2-4 specific, focused sub-questions
}
```

### Cost/Latency Warning

Multi-hop research is significantly more expensive than single-pass:

| Depth | Est. Latency | Est. LLM Calls | Est. Sources Extracted |
|-------|-------------|----------------|----------------------|
| 1 | 7-12s | 4-6 | 6 |
| 2 | 20-35s | 8-14 | 12-15 |
| 3 | 40-70s | 14-24 | 18-25 |
| 4 | 80-140s | 20-36 | 24-35 |
| 5 | 160-280s | 28-50 | 30-45 |

Each hop adds:
- 1 LLM call for sub-question generation from unknowns
- 3-6 executeSearch calls (one per sub-question)
- Up to 6 extractDocument calls
- 1 LLM call for synthesis
- 1 LLM call for contradiction detection

**Use depth conservatively.** Depth 2 is recommended for most use cases. Depth 3+ should only be used for mission-critical questions where missing information has high cost.

### Critical Points

- **Unknowns may not shrink**: If the root question has genuinely unresolvable gaps (e.g., "What color was the CEO's shirt?" when no source discusses it), all hops will regenerate similar unknowns. The system terminates only when depth is exhausted, so infinite loops are impossible — but wasted compute is not.
- **Source dedup across hops**: URLs extracted in hop 1 are excluded from hop 2's extraction queue. Only new URLs are fetched. This bounds the extraction cost but means hop 2 may find no new sources if the original search was comprehensive.
- **Confidence can decrease**: Adding contradictory sources in a later hop can *lower* the confidence score. This is correct behavior — the system is more informed — but may surprise users who expect monotonic improvement.
- **Sub-question quality**: The LLM generating follow-up sub-questions from unknowns is prompted with `temperature: 0.2`. Low creativity ensures focused questions but may miss creative reframings.
- **No streaming for multi-hop**: The SSE stream (`/v1/research/stream`) currently only supports single-pass research. Multi-hop answers are returned only via the blocking POST endpoint. Future improvement: SSE with hop-level events.

---

## Data Flow Summary

```
                         ┌──────────────────────────────┐
                         │       Client/Agent            │
                         └──────┬───────────────┬────────┘
                                │               │
                    ┌───────────▼────┐   ┌──────▼───────────┐
                    │  maxTokens     │   │  schema          │
                    │  (Feature 1)   │   │  (Feature 2)     │
                    │  /v1/search    │   │  /v1/extract     │
                    │  /v1/compress  │   └──────────────────┘
                    │  /v1/research  │
                    └────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
     ┌────────▼──────┐  ┌──────▼──────┐  ┌───────▼───────┐
     │  Batch        │  │  Verify     │  │  Watch        │
     │  Research     │  │  Claim      │  │  Subscription │
     │  (Feature 3)  │  │  (Feature 4)│  │  (Feature 5)  │
     │  BullMQ queue │  │  LLM +      │  │  BullMQ cron  │
     │  + webhook    │  │  substring  │  │  + webhook    │
     └───────────────┘  │  check      │  └────────────────┘
                        └─────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Multi-hop Research   │
                    │  (Feature 6)          │
                    │  depth parameter      │
                    │  Recursive unknowns   │
                    └───────────────────────┘
```

---

## File Manifest

| File | New? | Feature |
|------|------|---------|
| `src/modules/compression/tokenBudget.ts` | ✅ | 1 |
| `src/modules/extraction/structured.ts` | ✅ | 2 |
| `src/modules/research/batch.ts` | ✅ | 3 |
| `src/routes/batch-research.ts` | ✅ | 3 |
| `src/modules/verification/index.ts` | ✅ | 4 |
| `src/routes/verify-claim.ts` | ✅ | 4 |
| `src/modules/watch/index.ts` | ✅ | 5 |
| `src/routes/watch.ts` | ✅ | 5 |
| `src/modules/research/multihop.ts` | ✅ | 6 |
| `src/core/types.ts` | ✏️ | All — new types added |
| `src/routes/schemas.ts` | ✏️ | All — new schemas added |
| `src/infra/queue.ts` | ✏️ | 3, 5 — queue names added |
| `src/workers/index.ts` | ✏️ | 3, 5 — worker handlers added |
| `src/routes/index.ts` | ✏️ | All — route registration |
| `src/routes/search.ts` | ✏️ | 1 — maxTokens |
| `src/routes/extract.ts` | ✏️ | 2 — schema field |
| `src/routes/compress.ts` | ✏️ | 1 — maxTokens |
| `src/routes/research.ts` | ✏️ | 1, 6 — maxTokens, depth |
| `README.md` | ✏️ | All — full documentation |
