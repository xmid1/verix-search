# Verix Search

**Author:** [XMidleg](https://github.com/xmid1) — © 2026 All rights reserved under MIT License.

AI-native search, research, extraction, ranking, and verification platform built for autonomous AI agents. Hybrid multi-provider search with multi-signal ranking (11 signals), deep multi-step research with contradiction detection, structured extraction, citation verification, and freshness monitoring — all through a single API.

[GitHub Repository](https://github.com/xmid1/verix-search)

---

## Changelog

### v1.0 — Breaking Changes

| Change | Previous Behavior | New Behavior | Migration |
|--------|------------------|--------------|-----------|
| **`/v1/crawl`** | Simple alias for `/v1/extract` (single-page extraction with `crawler` scope) | Full multi-page crawl engine: sitemap discovery, link following, depth control, exclusion patterns, adaptive concurrency, webhook delivery | If you relied on `/v1/crawl` behaving identically to `/v1/extract`, switch to `/v1/extract` instead. The new `/v1/crawl` is a genuinely different endpoint optimized for crawling entire documentation sites. |
| **`/v1/verify-claim` response** | `verified: boolean` with 2 states (true/false) | `verdict: "supported" \| "contradicted" \| "partially_supported" \| "not_addressed" \| "source_unreachable"` with 5 distinct states. Also adds `evidenceVerified: boolean` confirming the evidence quote is a real substring of the source text. | Update consumers to read `verdict` instead of `verified`. The `verified: true` → `verdict: "supported"`, `verified: false` → check the specific verdict for granularity. |
| **`/v1/watch` threshold scale** | `threshold` scale ambiguous (examples used 7-8, but finalScore is 0-100) | `threshold` is now explicitly on the same 0-100 scale as `finalScore`. Default: 70. | Update existing watch subscriptions: multiply old threshold by 10 (e.g. 7 → 70). |

### v1.0.0 — Initial release

Core platform: `/v1/search`, `/v1/research`, `/v1/extract`, `/v1/crawl` (as alias), `/v1/rank`, `/v1/embeddings`, `/v1/compress`, `/v1/summarize`, `/v1/providers`, `/v1/auth/keys`, `/v1/health`, WebSocket gateway.

---

## Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Quick Start](#quick-start)
3. [Authentication & RBAC](#authentication--rbac)
4. [API Reference](#api-reference)
   - [Search](#1-post-v1search)
   - [Deep Research](#2-post-v1research)
   - [SSE Research Stream](#3-get-v1researchstream)
   - [Batch Research](#4-post-v1researchbatch)
   - [Extract](#5-post-v1extract)
   - [Crawl](#6-post-v1crawl)
   - [Rank](#7-post-v1rank)
   - [Embeddings](#8-post-v1embeddings)
   - [Compress](#9-post-v1compress)
   - [Summarize](#10-post-v1summarize)
   - [Citation Verification](#11-post-v1verify-claim)
   - [Watch / Freshness Alerts](#12-post-v1watch)
   - [List Providers](#13-get-v1providers)
   - [Auth Keys](#14-post-v1authkeys)
   - [Health & Metrics](#15-get-v1health-and-get-v1status)
5. [Agent-Native Features](#agent-native-features)
   - [Context Budget Awareness](#context-budget-awareness)
   - [Multi-Hop Recursive Research](#multi-hop-recursive-research)
   - [Structured Extraction with Schema](#structured-extraction-with-schema)
   - [Batch Async Research](#batch-async-research)
   - [Citation Verification](#citation-verification)
   - [Freshness-Sensitive Alerts](#freshness-sensitive-alerts)
6. [Ranking System](#ranking-system)
7. [Search Providers](#search-providers)
8. [Internal Flow](#how-it-works-internal-flow)
9. [Tech Stack](#tech-stack)
10. [SDK & Client Libraries](#sdk--client-libraries)
11. [Code Examples](#code-examples-by-language)
12. [Provider API Keys](#provider-api-keys)
13. [Environment Variables](#environment-variables)
14. [Testing](#testing)
15. [Deployment](#deployment)
16. [CI/CD](#cicd)
17. [License](#license)

---

## Overview & Architecture

Verix Search is a **hybrid search + deep research** engine purpose-built for AI agents that need deterministic, relevant results from diverse sources. It replaces the unreliable soup of scraping + keyword matching with structured pipelines:

| Capability | What It Does | Why Agents Need It |
|-----------|-------------|-------------------|
| **Hybrid Search** | Parallel multi-provider search with 11-signal ranking | Better results than any single search API |
| **Deep Research** | Multi-step: plan → search → extract → detect contradictions → synthesize → confidence score | One endpoint replaces hours of manual research |
| **Multi-Hop Research** | Recursively explores unknowns up to configurable depth | Uncovers blind spots without agent prompt engineering |
| **Structured Extraction** | Given a URL + JSON schema, returns extracted structured data | Replaces ad-hoc LLM JSON wrangling |
| **Batch Research** | Async processing of multiple research questions with webhook delivery | Parallel research without blocking agents |
| **Citation Verification** | Given a claim + source URL, verifies support via LLM analysis | Prevents hallucinated citations before they reach users |
| **Freshness Alerts** | Monitors queries and sends webhooks when new high-relevance results appear | Keeps agents current without polling |
| **Context Budget** | `maxTokens` controls how many results/details fit in an LLM context window | First search engine designed for LLM context limits |
| **Content Extraction** | Fetch URLs → Mozilla Readability → clean Markdown + code blocks | Reliable content extraction (beats browser scraping) |
| **Multi-Signal Ranking** | 11 signals: trust, freshness, AI relevance, semantic similarity, BM25, popularity, code quality, examples, authority, source quality, spam penalty | Richer ranking than PageRank alone |
| **Semantic Cache** | Vector-similarity caching via pgvector | Avoids redundant LLM calls, cuts costs |

### Architecture Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Client     │────▶│  Fastify API  │────▶│  Orchestrator   │
│  (curl/SDK) │     │  (20 routes)  │     │  (planner +     │
└─────────────┘     └──────────────┘     │  search + rank)  │
                                          └────────┬────────┘
                                                   │
                     ┌─────────────────────────────┼──────────────────────┐
                     │                             │                      │
                ┌────▼────┐                 ┌──────▼──────┐       ┌──────▼──────┐
                │  LLM    │                 │  27 Search  │       │   Redis     │
                │ (OpenAI │                 │  Providers  │       │  (Cache +   │
                │  Compat)│                 │  (GitHub,   │       │   Queues)   │
                └─────────┘                 │  Wikipedia, │       └─────────────┘
                                            │  Reddit...) │
                                            └──────┬──────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  PostgreSQL     │
                                          │  + pgvector     │
                                          └─────────────────┘
```

### Project Structure

```
src/
├── server.ts                       # Entry point
├── app.ts                          # Fastify app setup
├── config/env.ts                   # Zod-validated environment
├── core/types.ts                   # Shared domain types
├── infra/
│   ├── db.ts                       # Prisma + pgvector
│   ├── cache.ts                    # Redis
│   ├── embeddings.ts               # Embedding providers
│   ├── llm.ts                      # LLM client (OpenCode Zen)
│   ├── logger.ts                   # Pino logger
│   ├── metrics.ts                  # Prometheus metrics
│   └── queue.ts                    # BullMQ queues
├── modules/
│   ├── auth/                       # API keys, JWT, RBAC
│   ├── citation/                   # Citation engine
│   ├── compression/                # Context compression + token budget
│   ├── extraction/                 # HTML/PDF extraction + structured extraction
│   ├── knowledge/                  # Semantic cache
│   ├── memory/                     # Long-term source memory
│   ├── planner/                    # Intent detection, expansion, provider selection
│   ├── providers/                  # 27 search providers
│   ├── ranking/                    # 11-signal ranking + reranker
│   ├── research/                   # Deep research + multi-hop + batch
│   ├── search/                     # Quick search orchestrator
│   ├── streaming/                  # SSE/WebSocket events
│   ├── verification/               # Citation verification
│   └── watch/                      # Freshness alert subscriptions
├── workers/                        # BullMQ workers (9 queues)
└── routes/                         # Fastify route definitions
```

---

## Quick Start

### Prerequisites

- Node.js 24+
- PostgreSQL 17+ (with pgvector extension)
- Redis 7+
- An OpenCode Zen API key (or any OpenAI-compatible endpoint)

### Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials:
#   SUPABASE_DATABASE_URL=postgresql://user:pass@host:5432/verix_search
#   REDIS_URL=redis://localhost:6379
#   OPENCODE_API_KEY=sk-your-opencode-api-key

# 3. Generate Prisma client and push schema
npm run prisma:generate
npm run prisma:push

# 4. Seed the first admin API key
npm run seed

# 5. Start in development mode (server + workers)
npm run dev
```

### Docker

```bash
# Set required env vars
export JWT_SECRET=your-strong-secret
export OPENCODE_API_KEY=sk-your-opencode-api-key

# Start all services
docker compose up -d

# Create admin key
docker compose exec api node dist/scripts/seed.js admin@verix.dev ADMIN
```

---

## Authentication & RBAC

All endpoints (except `/v1/health` and `/v1/status`) require authentication.

### API Key (Recommended for Agents)

```http
X-API-Key: vx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Bearer Token (JWT)

```http
Authorization: Bearer <jwt-token>
```

### RBAC Roles & Scopes

| Role | Default Scopes |
|------|---------------|
| `ADMIN` | search, research, extraction, streaming, crawler, admin |
| `DEVELOPER` | search, research, extraction, streaming, crawler |
| `READ_ONLY` | search |
| `SEARCH_ONLY` | search |

### Getting Your First API Key

```bash
# Via seed script (out-of-band)
npm run seed admin@example.com ADMIN

# Via API (requires existing admin key)
curl -X POST http://localhost:5000/v1/auth/keys \
  -H "X-API-Key: vx_live_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","role":"DEVELOPER"}'
```

---

## API Reference

**Base URL:** `http://localhost:5000`

OpenAPI reference available at `http://localhost:5000/api-reference`.

---

### 1. `POST /v1/search`

Quick search — parallel search across 27 providers, deduplication, 11-signal hybrid ranking, and optional context budget awareness.

**Scope required:** `search`

#### Request

```json
{
  "query": "autonomous software engineering agents 2024 papers",
  "limit": 10,
  "scrape": false,
  "maxTokens": 4000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | Search query (1-500 chars) |
| `limit` | number | ❌ | Max results (1-50, default: 10) |
| `scrape` | boolean | ❌ | Fetch full page content for each result |
| `maxTokens` | number | ❌ | Context budget: system auto-trims results to fit this many tokens (agent-native feature) |

#### Response `200 OK`

```json
{
  "traceId": "abc123",
  "intent": "research",
  "intentSource": "regex",
  "language": "en",
  "providersUsed": ["arxiv", "github", "semanticscholar", "wikipedia"],
  "latencyMs": 3200,
  "cached": false,
  "degraded": false,
  "missingSignals": [],
  "results": [
    {
      "id": "arxiv-2401.00893",
      "url": "https://arxiv.org/abs/2401.00893",
      "title": "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering",
      "snippet": "SWE-agent turns LMs into software engineering agents...",
      "provider": "arxiv",
      "publishedAt": "2024-01-02T00:00:00Z",
      "author": "John Yang",
      "finalScore": 91.2,
      "signals": {
        "trust": 95,
        "freshness": 88,
        "aiRelevance": 0.92,
        "semanticSimilarity": 0.85,
        "bm25": 0.78,
        "spamPenalty": 0,
        "popularity": 0.92,
        "codeQuality": 0.4,
        "hasExamples": 0.0,
        "authority": 0.9,
        "sourceQuality": 0.95
      }
    }
  ]
}
```

When `maxTokens` is provided, results are automatically truncated to fit within the specified context budget.

---

### 2. `POST /v1/research`

Deep research — divides a question into sub-questions, searches each, extracts full pages, detects contradictions, synthesizes answers, and scores confidence. Supports multi-hop recursive research.

**Scope required:** `research`

#### Request

```json
{
  "question": "How does SWE-agent compare to Devin for automated bug fixing?",
  "useCache": true,
  "depth": 2,
  "maxTokens": 8000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | ✅ | Research question (1-1000 chars) |
| `useCache` | boolean | ❌ | Check semantic cache first (default: true) |
| `depth` | number | ❌ | Multi-hop depth (1-5, default: 1). Depth > 1 enables recursive research that follows unknowns. |
| `maxTokens` | number | ❌ | Context budget for the final answer |

#### Response `200 OK`

```json
{
  "question": "How does SWE-agent compare to Devin for automated bug fixing?",
  "summary": "SWE-agent and Devin represent two different approaches to automated software engineering...",
  "keyFacts": [
    "SWE-agent uses agent-computer interfaces (ACI) to interact with codebases",
    "Devin is a full autonomous AI software engineer developed by Cognition Labs",
    "SWE-agent achieved 12.3% resolution rate on SWE-bench, Devin achieved 13.86%"
  ],
  "examples": [
    "SWE-agent: bash commands + file editing through a structured interface"
  ],
  "warnings": [
    "Devin is not publicly available — results are from Cognition's technical report"
  ],
  "codeSnippets": [],
  "citations": [
    {
      "url": "https://arxiv.org/abs/2401.00893",
      "title": "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering",
      "author": "John Yang",
      "publishedAt": "2024-01-02T00:00:00Z",
      "provider": "arxiv",
      "trustScore": 95,
      "snippet": "SWE-agent turns LMs into software engineering agents..."
    }
  ],
  "contradictions": [
    {
      "topic": "benchmark performance comparison",
      "claimA": {
        "text": "SWE-agent achieves 12.3% on SWE-bench",
        "source": { "url": "https://arxiv.org/abs/2401.00893" }
      },
      "claimB": {
        "text": "Devin achieves 13.86% on SWE-bench",
        "source": { "url": "https://arxiv.org/abs/2401.00893" }
      },
      "resolution": "official_wins",
      "note": "Different benchmarks, different conditions — direct comparison limited"
    }
  ],
  "confidence": {
    "score": 82,
    "evidence": [
      "Multiple independent academic sources consulted",
      "Direct comparison from Arxiv papers"
    ],
    "unknowns": [
      "Devin's internal architecture details are not publicly documented"
    ],
    "weaknesses": [
      "Dependence on a single source for Devin's architecture"
    ]
  },
  "reasoningGraph": [
    { "step": "question", "detail": "How does SWE-agent compare to Devin for automated bug fixing?" },
    { "step": "intent", "detail": "Detected intent: research" },
    { "step": "sub_questions", "detail": "SWE-agent capabilities | Devin architecture | comparison benchmarks" },
    { "step": "evidence_collection", "detail": "Searched 6 providers, found 8 relevant pages" },
    { "step": "final_answer", "detail": "Synthesized answer from 5 sources with {N} hop(s)" }
  ]
}
```

---

### 3. `GET /v1/research/stream`

SSE streaming version of deep research. Streams progress events in real-time, then the final answer.

**Scope required:** `research`

#### Query Parameters

```
?question=How does SWE-agent compare to Devin?
```

#### Response (SSE stream)

```
event: planning
data: {"type":"planning","message":"Analyzing question and creating research plan","timestamp":"..."}

event: searching
data: {"type":"searching","message":"Searching 3 sub-question(s)","timestamp":"..."}

event: reading
data: {"type":"reading","message":"Extracting content from 6 source(s)","timestamp":"..."}

event: comparing
data: {"type":"comparing","message":"Checking sources for contradictions","timestamp":"..."}

event: building_context
data: {"type":"building_context","message":"Synthesizing final answer","timestamp":"..."}

event: done
data: {"type":"done","message":"Research complete","data":{"confidence":82,"citationCount":5}}

event: result
data: {"question":"...","summary":"...","keyFacts":[...],"confidence":{...}}
```

---

### 4. `POST /v1/research/batch`

Submit multiple research questions for async batch processing. Returns a `jobId` immediately. Poll the status endpoint or provide a webhook for delivery.

**Scope required:** `research`

#### Request

```json
{
  "questions": [
    "What is SWE-agent?",
    "How does Devin work?",
    "What is the ReAct paradigm?"
  ],
  "webhookUrl": "https://my-agent.example.com/webhooks/research-complete"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `questions` | string[] | ✅ | 1-20 research questions |
| `webhookUrl` | string | ❌ | Webhook called on completion with full results |

#### Response `200 OK`

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
  "questions": ["What is SWE-agent?", "How does Devin work?"],
  "answers": [
    { "summary": "SWE-agent is...", "confidence": { "score": 88 }, ... },
    { "summary": "Devin is...", "confidence": { "score": 82 }, ... }
  ],
  "errors": [null, null],
  "createdAt": "2025-03-15T10:00:00Z",
  "completedAt": "2025-03-15T10:02:30Z"
}
```

Status transitions: `pending` → `processing` → `completed` | `failed`.

---

### 5. `POST /v1/extract`

Fetch a URL and extract clean Markdown, code blocks, and metadata. Optionally provide a JSON schema for structured extraction (similar to Firecrawl/Exa).

**Scope required:** `extraction`

#### Request — Standard Extraction

```json
{
  "url": "https://react.dev/blog/2023/03/22/introducing-react-server-components"
}
```

#### Request — Structured Extraction with Schema

```json
{
  "url": "https://pricing.example.com",
  "schema": {
    "type": "object",
    "properties": {
      "plan_name": { "type": "string", "description": "Name of the pricing plan" },
      "monthly_price": { "type": "number", "description": "Monthly price in USD" },
      "features": { "type": "array", "description": "List of features included" }
    },
    "required": ["plan_name", "monthly_price"]
  }
}
```

#### Response — Standard

```json
{
  "url": "https://react.dev/blog/2023/03/22/...",
  "title": "Introducing React Server Components",
  "markdown": "# Introducing React Server Components\n\n...",
  "textLength": 12500,
  "codeBlocks": [
    { "language": "tsx", "code": "// ...", "lines": 15, "kind": "example" }
  ],
  "publishedAt": "2023-03-22T00:00:00Z",
  "author": "Dan Abramov",
  "metadata": { "source": "html" },
  "contentHash": "sha256-abc123..."
}
```

#### Response — Structured Extraction

```json
{
  "url": "https://pricing.example.com",
  "title": "Pricing Plans",
  "markdown": "# Pricing\n\n## Pro Plan\n$29/month...",
  "structured": {
    "plan_name": "Pro Plan",
    "monthly_price": 29,
    "features": ["Unlimited projects", "Team collaboration", "API access"]
  }
}
```

---

### 6. `POST /v1/crawl`

> ⚠️ **Breaking change (v1.0):** Previously `/v1/crawl` was a simple auth-scope alias for `/v1/extract`. It is now a full multi-page crawl engine with sitemap discovery, link following, depth control, and exclusion patterns. If you relied on the old alias behavior, use `/v1/extract` directly.

Multi-page crawler with sitemap discovery, adaptive parallel crawling, link following, depth tracking, content-type filtering, and optional webhook callback.

**Scope required:** `crawler`

#### Request

```json
{
  "url": "https://docs.example.com",
  "maxPages": 50,
  "sameDomain": true,
  "includeSitemap": true,
  "maxDepth": 3,
  "excludePatterns": ["/blog/", "tag/"],
  "webhookUrl": "https://my-agent.example.com/webhooks/crawl-complete",
  "webhookSecret": "optional-secret"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ❌ | Starting URL |
| `urls` | string[] | ❌ | Explicit URL list (1-20) |
| `maxPages` | number | ❌ | Max pages to crawl (1-200, default: 10) |
| `sameDomain` | boolean | ❌ | Stay on same domain (default: true) |
| `includeSitemap` | boolean | ❌ | Auto-discover sitemap.xml (default: true) |
| `maxDepth` | number | ❌ | Max link-following depth (1-10, default: 3) |
| `excludePatterns` | string[] | ❌ | URL substrings to skip (e.g. `["/blog/", "tag/", ".pdf"]`) |
| `webhookUrl` | string | ❌ | Async completion webhook |
| `webhookSecret` | string | ❌ | Sent as `X-Webhook-Secret` header for verification |

#### Response

```json
{
  "url": "https://docs.example.com",
  "documents": [
    {
      "url": "https://docs.example.com/intro",
      "title": "Introduction",
      "markdown": "...",
      "textLength": 12500,
      "codeBlocks": [],
      "contentHash": "sha256-abc123"
    }
  ],
  "sitemapUrls": ["https://docs.example.com/sitemap.xml"],
  "durationMs": 4500,
  "pagesCrawled": 10,
  "pagesSkipped": 3
}
```

---

### 7. `POST /v1/rank`

Score and rank a caller-supplied candidate list against a query using the full 11-signal ranking pipeline.

**Scope required:** `search`

#### Request

```json
{
  "query": "typescript generics",
  "candidates": [
    {
      "id": "doc1",
      "url": "https://www.typescriptlang.org/docs/handbook/2/generics.html",
      "title": "TypeScript: Handbook - Generics",
      "snippet": "A major part of software engineering is building components...",
      "publishedAt": "2024-01-15T00:00:00Z"
    }
  ]
}
```

#### Response

```json
[
  {
    "id": "doc1",
    "signals": {
      "trust": 100,
      "freshness": 75,
      "aiRelevance": 0.92,
      "semanticSimilarity": 0.88,
      "bm25": 0.95,
      "spamPenalty": 0,
      "popularity": 0.5,
      "codeQuality": 0.5,
      "hasExamples": 0.6,
      "authority": 0.85,
      "sourceQuality": 0.8
    },
    "finalScore": 91.2
  }
]
```

`POST /v1/rerank` is an alias with identical behavior.

---

### 8. `POST /v1/embeddings`

Compute embedding vectors using the configured embedding provider.

**Scope required:** `search`

#### Request

```json
{
  "texts": [
    "TypeScript is a typed superset of JavaScript",
    "Generics allow creating reusable components"
  ]
}
```

#### Response

```json
{
  "provider": "local",
  "dimensions": 384,
  "vectors": [
    [0.0123, -0.0456, 0.0789, ...],
    [0.0234, -0.0567, 0.0890, ...]
  ]
}
```

---

### 9. `POST /v1/compress`

Fetch and distill a set of URLs into structured facts, examples, warnings, and code relevant to a question. Respects `maxTokens` for context budget.

**Scope required:** `extraction`

#### Request

```json
{
  "question": "How do I use React Server Components?",
  "urls": [
    "https://react.dev/blog/2023/03/22/introducing-react-server-components",
    "https://nextjs.org/docs/app/building-your-application/rendering/server-components"
  ],
  "maxTokens": 4000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `maxTokens` | number | ❌ | Context budget: trims source content to fit |

#### Response

```json
{
  "keyFacts": [
    "React Server Components run exclusively on the server",
    "They can access databases and file systems directly"
  ],
  "examples": [
    "async function ServerComponent() { const data = await getData(); return <div>{data}</div>; }"
  ],
  "warnings": [
    "Server Components cannot use useState, useEffect, or event handlers"
  ],
  "code": [
    {
      "language": "tsx",
      "code": "async function BlogPost({ id }) {\n  const post = await db.post.findUnique({ where: { id } });\n  return <article>{post.content}</article>;\n}",
      "lines": 5,
      "kind": "example"
    }
  ],
  "references": [
    "https://react.dev/blog/2023/03/22/introducing-react-server-components"
  ]
}
```

---

### 10. `POST /v1/summarize`

Alias for `/v1/compress` returning only summary text and key facts.

**Scope required:** `extraction`

#### Response

```json
{
  "summary": "React Server Components run exclusively on the server...",
  "keyFacts": ["React Server Components run exclusively on the server"],
  "warnings": ["Server Components cannot use useState or useEffect"]
}
```

---

### 11. `POST /v1/verify-claim`

Verify whether a textual claim is supported by a given source URL. The system extracts the page content and uses LLM analysis to determine the relationship, with **5 distinct verdict states** and **automatic hallucination prevention** on evidence quotes.

**Scope required:** `research`

#### Request

```json
{
  "claim": "SWE-agent achieved 12.3% resolution rate on SWE-bench",
  "sourceUrl": "https://arxiv.org/abs/2401.00893"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `claim` | string | ✅ | The claim to verify (1-2000 chars) |
| `sourceUrl` | string | ✅ | URL of the source to check against |

#### Verdict States

| Verdict | Meaning | Agent Action |
|---------|---------|-------------|
| `supported` | Source explicitly supports the claim | Cite with confidence |
| `contradicted` | Source explicitly contradicts the claim | Flag contradiction |
| `partially_supported` | Source supports part but not all, or evidence is indirect | Cite with caveats |
| `not_addressed` | Source does not mention the claim or topic | Do not cite; seek other sources |
| `source_unreachable` | URL could not be fetched or extracted | Retry or skip |

#### Anti-Hallucination Protection

The `evidence` field is a **verbatim quote** from the source. After LLM extraction, the system **programmatically verifies** that the quoted text appears as a substring of the actual source content. The `evidenceVerified` boolean reports the result:
- `true` → evidence is confirmed as a real quote from the source
- `false` → LLM may have paraphrased or fabricated; marked with a warning prefix

If the LLM cannot produce a verifiable quote, the verdict degrades to `not_addressed` rather than fabricating.

#### Response `200 OK`

Claim is **supported** with verified quote:
```json
{
  "claim": "SWE-agent achieved 12.3% resolution rate on SWE-bench",
  "sourceUrl": "https://arxiv.org/abs/2401.00893",
  "verdict": "supported",
  "confidence": 95,
  "evidence": "SWE-agent achieves a 12.3% resolution rate on SWE-bench",
  "evidenceVerified": true,
  "contradictoryQuote": null
}
```

Claim is **not addressed** by the source:
```json
{
  "claim": "Claude 3.5 Sonnet achieves 50% on SWE-bench",
  "sourceUrl": "https://arxiv.org/abs/2401.00893",
  "verdict": "not_addressed",
  "confidence": 0,
  "evidence": "The paper only discusses SWE-agent's performance and does not mention Claude 3.5 Sonnet",
  "evidenceVerified": false,
  "contradictoryQuote": null
}
```

Claim is **contradicted**:
```json
{
  "claim": "SWE-agent cannot fix any bugs automatically",
  "sourceUrl": "https://arxiv.org/abs/2401.00893",
  "verdict": "contradicted",
  "confidence": 98,
  "evidence": "SWE-agent achieves a 12.3% resolution rate on SWE-bench",
  "evidenceVerified": true,
  "contradictoryQuote": "SWE-agent achieves a 12.3% resolution rate on SWE-bench"
}
```

Source is **unreachable**:
```json
{
  "claim": "SWE-agent achieved 12.3% on SWE-bench",
  "sourceUrl": "https://example.com/nonexistent",
  "verdict": "source_unreachable",
  "confidence": 0,
  "evidence": "Could not fetch or extract content from the provided URL",
  "evidenceVerified": false,
  "contradictoryQuote": null
}
```

---

### 12. `POST /v1/watch`

Create a watch subscription. The system periodically searches the query and sends a webhook when new high-relevance results appear.

**Scope required:** `search`

#### Request

```json
{
  "query": "SWE-agent SWE-bench new papers 2024",
  "threshold": 70,
  "webhookUrl": "https://my-agent.example.com/webhooks/new-results",
  "webhookSecret": "optional-secret-for-verification"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | Search query to monitor |
| `threshold` | number | ❌ | Minimum `finalScore` (0-100 scale) to trigger alert. Default: 70. Scores above 80 are highly relevant; 50-70 moderately relevant; below 50 likely noisy. |
| `webhookUrl` | string | ✅ | Webhook URL for alerts |
| `webhookSecret` | string | ❌ | Sent as X-Webhook-Secret header for verification |

#### Response `200 OK`

```json
{
  "id": "watch_abc123",
  "query": "SWE-agent SWE-bench new papers 2024",
  "threshold": 70,
  "webhookUrl": "https://my-agent.example.com/webhooks/new-results",
  "createdAt": "2025-03-15T10:00:00Z"
}
```

#### Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/watch/:id` | Get subscription details |
| `DELETE` | `/v1/watch/:id` | Delete subscription |

#### Webhook Payload

```json
{
  "event": "watch.alert",
  "subscriptionId": "watch_abc123",
  "query": "SWE-agent SWE-bench new papers 2024",
  "newResults": [
    {
      "url": "https://arxiv.org/abs/2405.12345",
      "title": "SWE-ABS: Automated Bug Squashing with Language Models",
      "snippet": "A new approach to automated bug fixing...",
      "provider": "arxiv",
      "publishedAt": "2025-03-14T00:00:00Z",
      "finalScore": 89.5
    }
  ],
  "checkedAt": "2025-03-15T10:00:00Z"
}
```

---

### 13. `GET /v1/providers`

List all configured search providers with live health status.

**Scope required:** `search`

#### Response

```json
{
  "providers": [
    {
      "id": "github",
      "displayName": "GitHub",
      "priority": 8,
      "capabilities": {
        "category": "code",
        "requiresApiKey": false,
        "rateLimitPerMinute": 10
      },
      "healthy": true
    }
  ]
}
```

---

### 14. `POST /v1/auth/keys`

Issue a new API key. **Admin only.** Plaintext key is returned exactly once.

**Scope required:** `admin`

#### Request

```json
{
  "name": "my-agent",
  "role": "DEVELOPER",
  "projectId": "optional-project-id"
}
```

#### Response

```json
{
  "id": "cm7...",
  "name": "my-agent",
  "role": "DEVELOPER",
  "scopes": ["search", "research", "extraction", "streaming", "crawler"],
  "apiKey": "vx_live_abc123def456..."
}
```

### `DELETE /v1/auth/keys/:id`

Revoke an API key. **Admin only.**

#### Response

```json
{ "revoked": true, "id": "cm7..." }
```

---

### 15. `GET /v1/health` and `GET /v1/status`

Liveness + dependency health check. **Unauthenticated.**

#### `/v1/health`

```json
{
  "status": "ok",
  "uptimeSeconds": 3600,
  "dependencies": {
    "database": true,
    "redis": true
  },
  "version": "v1"
}
```

#### `/v1/status`

```json
{
  "service": "verix-search",
  "version": "v1",
  "environment": "production",
  "uptimeSeconds": 3600
}
```

### `GET /metrics`

Prometheus metrics (text/plain). HTTP request duration, search latency by mode, provider latency, semantic cache hits/misses, queue depth, ranking signal distribution.

### `WS /v1/ws`

WebSocket gateway for real-time search and research.

```
ws://localhost:5000/v1/ws?apiKey=vx_live_...
```

Client messages: `{"id":"req-1","action":"search","payload":{"query":"...","limit":10}}` or `{"id":"req-2","action":"research","payload":{"question":"..."}}`.

---

## Agent-Native Features

### Context Budget Awareness

The `maxTokens` parameter transforms Verix from a "search engine for humans" into a "search engine for LLM context windows." Instead of telling the system how many results you want, you tell it how many tokens you have available, and it maximizes information density within that budget.

**Supported endpoints:**
- `POST /v1/search` — trims results to fit `maxTokens`
- `POST /v1/research` — truncates answer to fit `maxTokens`
- `POST /v1/compress` — limits source content per `maxTokens`
- `POST /v1/summarize` — limits source content per `maxTokens`

The token budget engine (`src/modules/compression/tokenBudget.ts`) computes:
- `maxResults` — how many results fit in the budget
- `maxCharsPerResult` — how much detail per result
- `maxTotalChars` — total content ceiling

### Multi-Hop Recursive Research

When `depth > 1` on `/v1/research`, the system doesn't stop after the first pass. It analyzes the `confidence.unknowns` from the first answer and generates new sub-questions specifically targeting those knowledge gaps:

1. **Pass 1**: Standard research → identifies unknowns
2. **Pass 2**: New sub-questions generated from unknowns → search + extract → merge with existing sources
3. **Pass N**: Repeat until depth is reached or no unknowns remain

This is distinct from static sub-question decomposition — the follow-up questions are _informed_ by what the first pass revealed it didn't know.

### Structured Extraction with Schema

Similar to Firecrawl's `extract` or Exa's structured retrieval, Verix accepts a JSON Schema on `/v1/extract` and returns structured data instead of raw Markdown:

**Use cases:**
- Extract pricing tables (plan names, prices, features)
- Extract product specs (dimensions, weight, materials)
- Extract article metadata (author, date, reading time, tags)
- Extract contact info (email, phone, address from a page)

The LLM extracts only fields matching the schema, making it deterministic and cacheable.

### Batch Async Research

For agents that need to research multiple questions in parallel without blocking:

1. `POST /v1/research/batch` with up to 20 questions → returns `jobId`
2. BullMQ worker processes each question via `runDeepResearch` in parallel (`Promise.allSettled`)
3. Poll `GET /v1/research/batch/:jobId` or receive webhook on completion
4. Results include `answers[]` and `errors[]` (null on success) in question order

### Citation Verification

Before citing a source, agents can verify that a source actually supports a specific claim:

- Extracts the full page content
- Uses LLM analysis to determine: **supports**, **contradicts**, or **doesn't mention**
- Returns confidence score, supporting evidence quote, and contradictory quote if found
- Conservative by design: uncertain → `verified: false`

This prevents the common LLM failure mode of citing sources that don't actually contain the claimed information.

### Freshness-Sensitive Alerts

Continuous monitoring for new relevant content:

1. Register a watch subscription with a query + similarity threshold
2. Background `watcher` BullMQ worker periodically checks for new results
3. When a result with `publishedAt > lastCheckedAt` and `finalScore >= threshold` appears, send a webhook
4. Configurable webhook secret for payload verification

---

## Ranking System

The ranking engine combines **11 signals** into a final score (0-100):

| Signal | Weight | Description |
|--------|--------|-------------|
| `trust` | 0.20 | Domain reputation (official docs=100, MDN=99, GitHub=96, .edu=95, 60+ domains) |
| `aiRelevance` | 0.20 | LLM-based relevance score (batched, one LLM call) |
| `semanticSimilarity` | 0.13 | Embedding cosine similarity (query ↔ document, skips BM25 penalty when unavailable) |
| `bm25` | 0.11 | Okapi BM25 keyword relevance (k1=1.5, b=0.75) |
| `freshness` | 0.10 | Publication recency (today=100, older decays to 30) |
| `sourceQuality` | 0.10 | Source type quality (arxiv=0.95, blog=0.30, SEO=0.20) |
| `popularity` | 0.05 | Platform popularity (GitHub stars, npm downloads) |
| `codeQuality` | 0.04 | Code platform signal (GitHub=0.9, npm=0.85) |
| `hasExamples` | 0.03 | Code example detection (3+ blocks=0.95) |
| `authority` | 0.02 | Domain/author authority (80+ high-trust domains) |
| `spamPenalty` | -0.25 × | Keyword stuffing, clickbait, link-farm detection, trusted domains get 90% reduction |

**Credibility Graph integration:** Historical source trustworthiness from DB feedback feeds into the trust score as a multiplier (0.8×-1.2×), adjusting authority for sources with proven track records.

**BM25 note:** BM25 is corpus-dependent — the same document can score differently across batches because IDF is computed relative to the other documents in that query's result set. Identical result sets produce identical BM25 scores.

**Embedding failure protection:** When embeddings are unavailable, `semanticSimilarity` defaults to 0.5 and the BM25 false-match penalty (which normally halves BM25 when BM25>0.5 and semantic<0.55) is automatically skipped — preventing cascading score collapse.

### Degradation Handling

When external services are unavailable, the engine gracefully degrades:
- **Embedding failure**: Falls back to BM25-only semantic scoring, adds `"semanticSimilarity"` to `missingSignals`
- **LLM failure**: Skips `aiRelevance`, adds `"aiRelevance"` to `missingSignals`
- **Response**: Sets `degraded: true` and lists all missing signals

### Heuristic Cross-Encoder Reranker

Solves "keyword hijacking" where a few matching keywords pull in off-topic results. Uses concept extraction, topic alignment scoring, and source-type penalties to push irrelevant results down.

### Source Quality Scoring

| Source Type | Score |
|------------|-------|
| Academic paper (arxiv, semanticscholar) | 0.95 |
| Official docs (MDN, Wikipedia) | 0.70-0.75 |
| GitHub repository | 0.80 |
| News (Google News, RSS) | 0.55-0.60 |
| Community (Stack Exchange) | 0.50 |
| Blog (dev.to) | 0.35 |
| SEO / Medium | 0.25-0.30 |
| Listicle ("top 10", "best N") | ≤0.25 |

### Source Credibility Graph (Integrated)

Tracks source trustworthiness over time. **Now fully integrated into the real-time ranking pipeline:**
- `heuristicCredibility()` runs synchronously for every ranked result, adjusting the trust signal by domain+provider heuristics
- User feedback signals (`recordFeedback()`) persist credibility scores to PostgreSQL
- `credibilityMultiplier()` adjusts the final authority score by 0.8×-1.2× based on historical performance
- Cold-start heuristic covers new domains until sufficient feedback accumulates

### Long-Term Source Memory

Remembers which sources were useful for which topics. `findBestSources(query)` returns top-performing sources for any topic based on historical result quality.

---

## Search Providers

| Provider | ID | Category | Auth Required |
|----------|-----|----------|-------------|
| Brave Search | `brave` | general | `BRAVE_API_KEY` |
| DuckDuckGo | `duckduckgo` | general | None |
| GitHub | `github` | code | None |
| Stack Overflow | `stackexchange` | community | None |
| MDN Web Docs | `mdn` | docs | None |
| Semantic Scholar | `semanticscholar` | academic | None |
| PubMed | `pubmed` | academic | None |
| arXiv | `arxiv` | academic | None |
| Crossref | `crossref` | academic | None |
| Google News | `googlenews` | news | `GOOGLE_API_KEY` (opt) |
| YouTube | `youtube` | general | None |
| Hacker News | `hackernews` | community | None |
| Dev.to | `devto` | community | None |
| Reddit | `reddit` | community | `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` (opt) |
| Medium | `medium` | community | None |
| Twitter / X | `twitter` | community | `TWITTER_BEARER_TOKEN` (opt) |
| Wikipedia | `wikipedia` | general | None |
| npm Registry | `npm` | package | None |
| PyPI | `pypi` | package | None |
| GDELT Project | `gdelt` | news | None |
| MITRE CVE | `cve` | security | None |
| OSV.dev | `osv` | security | None |
| Wikidata | `wikidata` | general | None |
| Common Crawl | `commoncrawl` | general | None |
| Internet Archive | `internetarchive` | general | None |
| RSS Feed Aggregator | `rss` | news | None |

---

## How It Works (Internal Flow)

### Quick Search Flow

```
Client → POST /v1/search
  → buildSearchPlan()
    → detectLanguage()                       ← Unicode range detection
    → detectIntent()                         ← 15 regex heuristics + LLM fallback
    → classifyNews()                         ← 7 news categories
    → expandEntities()                       ← Entity injection (SWE-agent, Devin, etc.)
    → expandQuery()                          ← LLM + entity-expanded queries
    → selectProviders()                      ← Intent-based + entity-preferred sources
  → pre-search provider filter
    → health() check                         ← Skip unhealthy providers
    → excludeSources                         ← Entity-based exclusion
    → newsCategory filter                    ← e.g. exclude hackernews for cybersecurity
  → parallel search (p-limit 6 concurrent, 5s timeout, 10s global)
    → 28 providers × 3 max per provider cap
  → per-provider cap                         ← Max 3 per provider
  → deduplicateByContent()                   ← SHA-256 + semantic embedding
  → rankResults()                            ← 11 signals + BM25 false-match halving
  → Heuristic Cross-Encoder Reranker         ← Concept alignment scoring
  → AI-targeted content detection            ← Patterns: "optimized for LLM", etc.
  → Optional: scrape top 3 results           ← If scrape: true
  → Context budget trimming                  ← If maxTokens provided
  → Response + persistence + cache
```

### Deep Research Flow

```
Client → POST /v1/research
  → check Semantic Cache (pgvector, 0.92 threshold)
  → buildResearchPlan()
    → LLM divides question into 3-6 sub-questions
  → for each sub-question:
    → executeSearch() (same pipeline as quick search)
    → extractDocument()
  → detectContradictions()                   ← LLM compares claims pairwise
  → synthesizeAnswer()                       ← LLM with citations
  → computeConfidence()                      ← Deterministic engine
  → Multi-hop: if depth > 1
    → analyze unknowns from confidence
    → generate new sub-questions from unknowns
    → search + extract → merge sources
    → repeat until depth exhausted
  → Response
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js + TypeScript | 24 / 5 |
| Framework | Fastify | 5 |
| Database | PostgreSQL + pgvector | 17 |
| Cache | Redis | 7 |
| ORM | Prisma | 7 |
| Validation | Zod | 4 |
| Work Queue | BullMQ | 9 queues |
| Embeddings | HuggingFace Transformers / OpenAI / Gemini / Voyage / Jina / Ollama | |
| LLM | OpenAI-compatible gateway (OpenCode Zen) | |
| Monitoring | Prometheus (prom-client) + Pino | |
| Testing | Vitest | 282+ tests, 27+ test files |

---

## SDK & Client Libraries

### Official MCP Server

```bash
npx @verix/mcp-server
```

Exposes all Verix Search capabilities as MCP tools for AI agents.

---

## Code Examples by Language

### cURL

```bash
# ── Quick Search ──
curl -s -X POST http://localhost:5000/v1/search \
  -H "X-API-Key: vx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"query":"autonomous software engineering agents","limit":5,"maxTokens":4000}' \
  | jq '.results[] | {title: .title, url: .url, score: .finalScore}'

# ── Deep Research ──
curl -s -X POST http://localhost:5000/v1/research \
  -H "X-API-Key: vx_live_..." \
  -H "Content-Type: application/json" \
  -d '{"question":"How does SWE-agent compare to Devin?","depth":2}' \
  | jq '{summary, confidence}'

# ── Batch Research ──
curl -s -X POST http://localhost:5000/v1/research/batch \
  -H "X-API-Key: vx_live_..." \
  -H "Content-Type: application/json" \
  -d '{"questions":["What is SWE-agent?","How does Devin work?"]}' \
  | jq .

# ── Structured Extraction ──
curl -s -X POST http://localhost:5000/v1/extract \
  -H "X-API-Key: vx_live_..." \
  -H "Content-Type: application/json" \
  -d '{"url":"https://pricing.example.com","schema":{"type":"object","properties":{"price":{"type":"number","description":"Monthly price"}}}}'

# ── Citation Verification ──
curl -s -X POST http://localhost:5000/v1/verify-claim \
  -H "X-API-Key: vx_live_..." \
  -H "Content-Type: application/json" \
  -d '{"claim":"SWE-agent achieved 12.3% on SWE-bench","sourceUrl":"https://arxiv.org/abs/2401.00893"}' \
  | jq .

# ── Watch Subscription ──
curl -s -X POST http://localhost:5000/v1/watch \
  -H "X-API-Key: vx_live_..." \
  -H "Content-Type: application/json" \
  -d '{"query":"SWE-agent new papers","threshold":8,"webhookUrl":"https://my-agent.example.com/webhook"}'

# ── SSE Research Stream ──
curl -s -N -H "X-API-Key: vx_live_..." \
  "http://localhost:5000/v1/research/stream?question=How+does+SWE-agent+work?"
```

### Python

```python
import requests, json

API_KEY = "vx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
BASE = "http://localhost:5000"
headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# ── Quick Search ──
r = requests.post(f"{BASE}/v1/search", headers=headers,
    json={"query": "autonomous software engineering agents", "limit": 5, "maxTokens": 4000})
data = r.json()
for res in data["results"]:
    print(f"  [{res['finalScore']:.0f}] {res['title']}")

# ── Structured Extraction ──
r = requests.post(f"{BASE}/v1/extract", headers=headers,
    json={"url": "https://pricing.example.com", "schema": {
        "type": "object",
        "properties": {"price": {"type": "number", "description": "Monthly price"}}
    }})
print(r.json()["structured"])

# ── Deep Research with Streaming ──
with requests.get(f"{BASE}/v1/research/stream", headers=headers,
    params={"question": "How does SWE-agent compare to Devin?"}, stream=True) as r:
    for line in r.iter_lines():
        if line and line.startswith(b"data: "):
            event = json.loads(line[6:])
            print(f"[{event.get('type','?')}] {event.get('message','')}")

# ── Citation Verification ──
r = requests.post(f"{BASE}/v1/verify-claim", headers=headers, json={
    "claim": "SWE-agent achieved 12.3% on SWE-bench",
    "sourceUrl": "https://arxiv.org/abs/2401.00893"
})
print(r.json())

# ── Watch Subscription ──
r = requests.post(f"{BASE}/v1/watch", headers=headers, json={
    "query": "SWE-agent new papers", "threshold": 8,
    "webhookUrl": "https://my-agent.example.com/webhook"
})
print(f"Watch ID: {r.json()['id']}")
```

### TypeScript / JavaScript

```typescript
const API_KEY = "vx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const BASE = "http://localhost:5000";

async function api(path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Context-aware search
const search = await api("/v1/search", {
  query: "autonomous software engineering agents",
  maxTokens: 4000,
});
console.log(search.results.map((r: any) => `${r.finalScore}: ${r.title}`));

// Multi-hop research
const research = await api("/v1/research", {
  question: "How does SWE-agent compare to Devin?",
  depth: 2,
});

// Batch research
const batch = await api("/v1/research/batch", {
  questions: ["What is SWE-agent?", "What is Devin?"],
});
const { jobId } = batch;
const status = await api(`/v1/research/batch/${jobId}`);

// Structured extraction
const extracted = await api("/v1/extract", {
  url: "https://pricing.example.com",
  schema: { type: "object", properties: { price: { type: "number" } } },
});

// Citation verification
const verified = await api("/v1/verify-claim", {
  claim: "SWE-agent achieved 12.3% on SWE-bench",
  sourceUrl: "https://arxiv.org/abs/2401.00893",
});
```

More examples in Go, Rust, Java, Ruby, PHP, and WebSocket are available in the source repository.

---

## Provider API Keys

Some providers require API keys for full functionality. Without them, they fall back to public/scraped endpoints (which may have rate limits or IP blocks).

| Variable | Required For | Provider | Free Tier | How To Get |
|----------|-------------|----------|-----------|------------|
| `BRAVE_API_KEY` | Full quality | Brave Search | 2,000 queries/month | [brave.com/search/api](https://brave.com/search/api/) |
| `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Cloud IP access | Reddit | Unlimited | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) |
| `TWITTER_BEARER_TOKEN` | API access | Twitter/X | 500k tweets/month | [developer.twitter.com](https://developer.twitter.com/) |
| `GOOGLE_API_KEY` | API access | Google News | 100 req/day | [gnews.io](https://gnews.io/) |

**Without API keys:**
- Reddit → `reddit.com/search.json` (blocked on some cloud IPs)
- Twitter → HTML scraping (brittle)
- Google News → RSS scraping (no search, just recent news)
- Brave → disabled entirely

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_DATABASE_URL` | ✅ | — | PostgreSQL with pgvector |
| `REDIS_URL` | ✅ | — | Redis for cache and queues |
| `OPENCODE_API_KEY` | ✅ | — | OpenAI-compatible LLM API key |
| `JWT_SECRET` | ❌ | dev-only | JWT signing secret (min 16 chars) |
| `CORS_ORIGIN` | ❌ | `*` | CORS origins (comma-separated) |
| `PORT` | ❌ | `5000` | HTTP server port |
| `HOST` | ❌ | `0.0.0.0` | Server host |
| `LOG_LEVEL` | ❌ | `info` | Pino log level |
| `EMBEDDING_PROVIDER` | ❌ | `local` | Embedding provider |
| `LLM_BASE_URL` | ❌ | `https://opencode.ai/zen/v1` | OpenAI-compatible base URL |
| `RATE_LIMIT_MAX` | ❌ | `120` | Max requests per window |
| `SEARCH_TIMEOUT_MS` | ❌ | `5000` | Global search timeout |
| `MAX_PROVIDERS_PER_QUERY` | ❌ | `8` | Max providers per search |
| `REDDIT_CLIENT_ID` | ❌ | `""` | Reddit OAuth client ID |
| `REDDIT_CLIENT_SECRET` | ❌ | `""` | Reddit OAuth client secret |
| `BRAVE_API_KEY` | ❌ | `""` | Brave Search API key |
| `TWITTER_BEARER_TOKEN` | ❌ | `""` | Twitter/X API Bearer Token |
| `GOOGLE_API_KEY` | ❌ | `""` | Google API / GNews key |
| `GOOGLE_CSE_ID` | ❌ | `""` | Google Custom Search Engine ID |
| `CRAWLER_JS_RENDER` | ❌ | `false` | Enable JS rendering |
| `CRAWLER_WEBHOOK_URL` | ❌ | `""` | Webhook for crawl completion |

---

## Testing

```bash
# Run all tests (282+ tests across 27+ test files)
npm test

# Watch mode
npm run test:watch

# Coverage report
npx vitest run --coverage

# Run evaluation benchmark (10 domains, 16 graded queries, 17 adversarial tests)
npm run benchmark:full

# Quick benchmark (6 key queries, mock mode available)
npm run benchmark:quick

# Mock mode — no external providers needed, uses synthetic data
npm run benchmark:mock

# CI quality gate (blocks on threshold violation, 50% max degradation)
npm run quality:gate

# Adversarial tests only (edge, malformed, extreme, security, provider)
npm run quality:adversarial
```

### Test Coverage

| File | Tests | What It Covers |
|------|-------|---------------|
| `tests/ranking.test.ts` | 67 | 11-signal ranking, RRF fusion, reranker |
| `tests/reranker.test.ts` | 11 | Cross-encoder reranker, react.dev hijack fix |
| `tests/trust.test.ts` | 22 | Domain trust scoring |
| `tests/intent.test.ts` | 21 | Intent detection (15+ intents) |
| `tests/codeExtractor.test.ts` | 19 | Code extraction |
| `tests/newsClassifier.test.ts` | 13 | News classification (7 categories) |
| `tests/sourceQuality.test.ts` | 9 | Source quality scoring |
| `tests/entityExpander.test.ts` | 5 | Entity expansion (AI agents, CTF, LLM papers) |
| `tests/extraction.test.ts` | 11 | Content extraction pipeline |
| `tests/confidence.test.ts` | 10 | Confidence engine (deterministic) |
| `tests/providerSelection.test.ts` | 9 | Provider selection |
| `tests/providerRegistry.test.ts` | 8 | All 27 providers loaded |
| `tests/crawler.test.ts` | 7 | Crawler — link extraction + sitemap |
| `tests/spamFixed.test.ts` | 7 | Spam penalty — trusted domain exemption |
| `tests/determinism.test.ts` | 3 | `computeFinalScore` bit-for-bit determinism |
| `tests/search.test.ts` | 5 | Search orchestrator integration |
| `tests/health.test.ts` | 4 | Health check endpoint |
| `tests/auth.test.ts` | 2 | Authentication middleware |
| Provider tests | ~45 | Individual provider test suites |

---

## Deployment

### Docker

```bash
docker compose up -d
```

### Manual (Production)

```bash
npm run build
npm run prisma:generate
node dist/src/server.js
```

---

## CI/CD

GitHub Actions runs on every push and pull request:

1. **Lint** — ESLint with TypeScript rules
2. **Type-check** — `tsc --noEmit`
3. **Test** — `vitest run` (282 tests)
4. **Build** — TypeScript compilation

---

## License

MIT — see [LICENSE](LICENSE).
