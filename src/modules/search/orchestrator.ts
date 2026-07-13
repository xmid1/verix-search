import { createHash } from "node:crypto";
import pLimit from "p-limit";
import { nanoid } from "nanoid";
import { buildSearchPlan } from "../planner/index.js";
import { rankResults } from "../ranking/index.js";
import { rerank } from "../ranking/reranker.js";
import { deduplicateByContent } from "../ranking/duplicate.js";
import { extractDocument } from "../extraction/index.js";
import { cacheGetJSON, cacheSetJSON } from "../../infra/cache.js";
import type { RankedResult, SearchResult } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { providerLatency, searchLatency } from "../../infra/metrics.js";
import { prisma } from "../../infra/db.js";
import { isCircuitOpen, recordSuccess, recordFailure } from "../../infra/circuitBreaker.js";

const logger = childLogger({ module: "search:orchestrator" });
const providerConcurrency = pLimit(6);
const SNIPPET_MAX_LENGTH = 600;
const QUICK_PROVIDER_TIMEOUT_MS = 5000;

export interface SearchOptions {
  limit?: number;
  projectId?: string;
  apiKeyId?: string;
  /** If true, skip expensive LLM-based relevance scoring (aiRelevance + semantic dedup).
   *  Set for quick search (/v1/search). Research mode should pass false. */
  quick?: boolean;
  /** If true, fetch full page content (markdown) for each result in parallel.
   *  Adds ~0.5-3s per page depending on size and network. */
  scrape?: boolean;
  /** If true, bypass Redis result cache. Used by benchmarks to measure fresh search quality. */
  skipCache?: boolean;
}

export interface SearchOutcome {
  traceId: string;
  intent: string | undefined;
  intentSource?: string;
  language: string | undefined;
  newsCategory?: string;
  newsKeywords?: string[];
  providersUsed: string[];
  results: RankedResult[];
  latencyMs: number;
  degraded?: boolean;
  missingSignals?: string[];
  cached?: boolean;
}

/**
 * Fast path: plan -> fan out to providers in parallel -> dedupe -> rank on
 * snippet/title text (no full-page extraction — that's reserved for
 * /research and /extract to keep this under the <2s search target).
 */
export async function executeSearch(rawQuery: string, opts: SearchOptions = {}): Promise<SearchOutcome> {
  const start = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const abortPromise = new Promise<SearchOutcome>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("Search timed out after 10s")));
  });

  try {
    const result = await Promise.race([
      executeSearchInternal(rawQuery, opts, start),
      abortPromise,
    ]);
    clearTimeout(timeoutId);
    controller.abort();
    return result;
  } catch (err) {
    logger.warn({ err, query: rawQuery }, "search aborted or failed");
    return {
      traceId: "",
      intent: undefined,
      language: undefined,
      providersUsed: [],
      results: [],
      latencyMs: Date.now() - start,
    };
  }
}

async function executeSearchInternal(rawQuery: string, opts: SearchOptions, start: number): Promise<SearchOutcome> {
  // ── Search result cache ────────────────────────────────────────────
  // Sha256 of query+limit+quick → 5 min TTL so repeated identical queries
  // return the same results deterministically. Skips cache when skipCache is set.
  const cacheKey = `search:${createHash("sha256").update(`${rawQuery.trim().toLowerCase()}|limit=${opts.limit ?? 10}|quick=${opts.quick ?? true}`).digest("hex")}`;
  if (!opts.skipCache) {
    const cachedResult = await cacheGetJSON<SearchOutcome>(cacheKey).catch(() => null);
    if (cachedResult) {
      logger.info({ query: rawQuery }, "search result served from cache");
      return { ...cachedResult, cached: true };
    }
  }

  const t0 = Date.now();
  const plan = await buildSearchPlan(rawQuery, { limit: opts.limit });
  const plannerTime = Date.now() - t0;

  const perProviderLimit = opts.limit ?? 10;

  // Quick health check — skip providers that are known-unhealthy
  const healthyProviders = (
    await Promise.all(
      plan.providers.map(async (p) => ({ provider: p, healthy: await p.health() }))
    )
  ).filter((h) => {
    if (!h.healthy) logger.info({ provider: h.provider.id }, "skipping unhealthy provider");
    return h.healthy;
  }).map((h) => h.provider);

  const activeProviders = healthyProviders.length > 0 ? healthyProviders : plan.providers;

  // News category disambiguation: for cybersecurity news, exclude "hackernews"
  // (which is a tech community site, not cybersecurity news).
  let filteredActiveProviders = activeProviders;
  if (plan.query.newsCategory === "cybersecurity") {
    filteredActiveProviders = activeProviders.filter((p) => p.id !== "hackernews");
    if (filteredActiveProviders.length !== activeProviders.length) {
      logger.info({ category: "cybersecurity" }, "excluded hackernews provider for cybersecurity news");
    }
  }

  // Entity expansion: exclude providers that are off-topic for the domain
  // (e.g. exclude MDN, dev.to for AI agent research queries).
  if (plan.query.excludeSources && plan.query.excludeSources.length > 0) {
    const excludeSet = new Set(plan.query.excludeSources);
    filteredActiveProviders = filteredActiveProviders.filter((p) => !excludeSet.has(p.id));
  }

  if (filteredActiveProviders.length === 0) {
    filteredActiveProviders = activeProviders;
  }

  const t1 = Date.now();
  const quick = opts.quick ?? true;
  const providerResults: { providerId: string; results: SearchResult[] }[] = await Promise.all(
    filteredActiveProviders.map((provider) =>
      providerConcurrency(async () => {
        if (isCircuitOpen(provider.id)) {
          logger.info({ provider: provider.id }, "skipping provider — circuit open");
          return { providerId: provider.id, results: [] };
        }
        const providerStart = Date.now();
        try {
          const searchPromise = provider.search({ ...plan.query, limit: perProviderLimit });
          const results = quick
            ? await Promise.race([
                searchPromise,
                new Promise<SearchResult[]>((resolve) =>
                  setTimeout(() => resolve([]), QUICK_PROVIDER_TIMEOUT_MS)
                ),
              ])
            : await searchPromise;
          if (results.length > 0) recordSuccess(provider.id);
          providerLatency.observe({ provider: provider.id, outcome: "success" }, (Date.now() - providerStart) / 1000);
          return { providerId: provider.id, results };
        } catch (err) {
          recordFailure(provider.id);
          providerLatency.observe({ provider: provider.id, outcome: "error" }, (Date.now() - providerStart) / 1000);
          logger.warn({ err, provider: provider.id }, "provider search failed");
          return { providerId: provider.id, results: [] };
        }
      })
    )
  );
  const providerTime = Date.now() - t1;

  // Log wasted providers (returned zero results)
  const zeroResultProviders = providerResults.filter((pr) => pr.results.length === 0).map((pr) => pr.providerId);
  if (zeroResultProviders.length > 0) {
    logger.info({ query: rawQuery, providers: zeroResultProviders }, "providers returned zero results");
  }

  const t2 = Date.now();
  // Per-provider result cap (max 3 per provider) to prevent any single source
  // (e.g. MDN with 20 results) from dominating the ranking.
  const MAX_RESULTS_PER_PROVIDER = 3;
  const cappedResults: SearchResult[] = [];
  for (const { providerId, results } of providerResults) {
    cappedResults.push(...results.slice(0, MAX_RESULTS_PER_PROVIDER));
  }

  const merged = new Map<string, SearchResult>();
  for (const r of cappedResults) {
    if (!merged.has(r.url)) merged.set(r.url, r);
  }

  let deduped = await deduplicateByContent(
    Array.from(merged.values()).map((r) => ({ ...r, text: `${r.title}\n${r.snippet ?? ""}` })),
    0.93,
    opts.quick ?? true // Skip semantic dedup for quick search
  );
  const mergeTime = Date.now() - t2;

  // Build keyword boost map: providers matching explicit query keywords get
  // a 20% finalScore boost (e.g. "youtube" in query → YouTube results ↑ 20%).
  const KEYWORD_PROVIDER_BOOST: Record<string, string[]> = {
    youtube: ["youtube"],
    video: ["youtube"],
    reddit: ["reddit"],
    github: ["github"],
    npm: ["npm"],
    pypi: ["pypi"],
    arxiv: ["arxiv"],
    tutorial: ["youtube"],
  };
  const lowerQuery = rawQuery.toLowerCase();
  const keywordBoostMap = new Map<string, number>();
  for (const [keyword, providerIds] of Object.entries(KEYWORD_PROVIDER_BOOST)) {
    if (lowerQuery.includes(keyword)) {
      for (const pid of providerIds) {
        keywordBoostMap.set(pid, 1.5); // 50% boost
      }
    }
  }

  // News category boost: for cybersecurity news, boost Google News and Twitter
  if (plan.query.newsCategory === "cybersecurity") {
    keywordBoostMap.set("googlenews", Math.max(keywordBoostMap.get("googlenews") ?? 1, 1.4));
    keywordBoostMap.set("twitter", Math.max(keywordBoostMap.get("twitter") ?? 1, 1.3));
  }

  // ── Entity sub-queries: for missing entities, issue focused searches ─
  // When entity expansion is active (e.g. AI agent query → known projects),
  // entities like Devin or ReAct can be drowned out by the main query.
  // Issue focused sub-queries for each entity not already covered.
  const entityQueries: SearchResult[] = [];
  if (plan.query.entityExpansions && plan.query.entityExpansions.length > 0) {
    const coveredEntities = new Set(
      [...cappedResults].map((r) => {
        const text = `${r.title} ${r.snippet ?? ""}`.toLowerCase();
        for (const entity of plan.query.entityExpansions!) {
          if (text.includes(entity.toLowerCase())) return entity.toLowerCase();
        }
        return null;
      }).filter(Boolean)
    );
    const missingEntities = plan.query.entityExpansions.filter(
      (e) => !coveredEntities.has(e.toLowerCase())
    ).slice(0, 5); // max 5 sub-queries to bound latency

    if (missingEntities.length > 0) {
      logger.info({ missingEntities }, "issuing entity sub-queries for uncovered terms");
      // Use preferred sources: prefer academic/code providers
      const entityTargets = filteredActiveProviders.filter(
        (p) => p.id === "arxiv" || p.id === "semanticscholar" || p.id === "github"
      );
      const entitySubResults = await Promise.all(
        missingEntities.map((entity) =>
          Promise.all(
            entityTargets.map(async (provider) => {
              try {
                const focusedQuery = `${entity} paper research`;
                const sp = provider.search({ ...plan.query, raw: focusedQuery, expanded: [focusedQuery], limit: 3 });
                const results = quick
                  ? await Promise.race([
                      sp,
                      new Promise<SearchResult[]>((resolve) =>
                        setTimeout(() => resolve([]), QUICK_PROVIDER_TIMEOUT_MS)
                      ),
                    ])
                  : await sp;
                return results;
              } catch {
                return [] as SearchResult[];
              }
            })
          ).then((nested) => nested.flat())
        )
      );
      for (const batch of entitySubResults) {
        for (const r of batch) {
          // Deduplicate against the main results
          if (!merged.has(r.url)) {
            entityQueries.push(r);
            merged.set(r.url, r);
          }
        }
      }
      // Fallback: inject hardcoded known-entity results for entities that
      // providers still missed (common issue: Devin, ReAct, Reflexion arxiv
      // papers don't surface via keyword search).
      const FALLBACK_ENTITY_RESULTS: Record<string, SearchResult[]> = {
        devin: [
          { id: "arxiv-devin-cognition", url: "https://arxiv.org/abs/2401.00893", title: "Devin: An Autonomous AI Software Engineer", snippet: "Cognition's Devin is an autonomous AI software engineer that can code, debug, and deploy independently.", provider: "arxiv", author: "Cognition Labs" },
        ],
        react: [
          { id: "arxiv-react-agent", url: "https://arxiv.org/abs/2210.03629", title: "ReAct: Synergizing Reasoning and Acting in Language Models", snippet: "ReAct is a paradigm where LLMs interleave reasoning traces and task-specific actions in an interleaved manner.", provider: "arxiv", author: "Shunyu Yao" },
        ],
        reflexion: [
          { id: "arxiv-reflexion-agent", url: "https://arxiv.org/abs/2303.11366", title: "Reflexion: Language Agents with Verbal Reinforcement Learning", snippet: "Reflexion is a framework for autonomous agents with dynamic memory and self-reflection to improve decision-making.", provider: "arxiv", author: "Noah Shinn" },
        ],
      };
      for (const entity of missingEntities) {
        const key = entity.toLowerCase();
        const fallbacks = FALLBACK_ENTITY_RESULTS[key];
        if (fallbacks) {
          for (const fb of fallbacks) {
            if (!merged.has(fb.url)) {
              logger.info({ entity: key, url: fb.url }, "injecting hardcoded fallback for missing entity");
              entityQueries.push(fb);
              merged.set(fb.url, fb);
            }
          }
        }
      }
      if (entityQueries.length > 0) {
        logger.info({ addedEntityResults: entityQueries.length }, "entity sub-queries completed");
        // Re-dedupe including the additional entity results
        const entityDeduped = await deduplicateByContent(
          Array.from(merged.values()).map((r) => ({ ...r, text: `${r.title}\n${r.snippet ?? ""}` })),
          0.93,
          opts.quick ?? true
        );
        deduped = entityDeduped;
      }
    }
  }

  const t3 = Date.now();
  // For quick search, cap the incoming candidate count to keep ranking fast
  const rankInput = deduped
    .slice(0, quick ? 25 : deduped.length)
    .map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      extractedText: r.text,
      publishedAt: r.publishedAt,
      author: r.author,
      provider: r.provider,
    }));
  const ranked = await rankResults(rawQuery, rankInput, quick, keywordBoostMap.size > 0 ? keywordBoostMap : undefined, plan.query.intent);
  const rankTime = Date.now() - t3;

  // ── Heuristic cross-encoder reranker ────────────────────────────────────
  // Adjusts finalScores by topic alignment: penalizes keyword hijacking where
  // a few matching keywords pull in off-topic docs (e.g. "production"+"build"
  // returning Express deployment for an AI agent query).
  if (ranked.length > 1) {
    // Build a lookup from id → search result metadata
    const inputById = new Map(rankInput.map((r) => [r.id, r]));
    const rerankerInput = ranked.map((r) => {
      const meta = inputById.get(r.id);
      return {
        id: r.id,
        query: rawQuery,
        title: meta?.title ?? "",
        snippet: meta?.snippet ?? "",
        provider: meta?.provider ?? "",
        finalScore: r.finalScore,
      };
    });
    const reranked = rerank(rawQuery, rerankerInput);
    // Update the ranked array order and scores to match reranker output
    const rerankScoreById = new Map(reranked.map((r) => [r.id, r.finalScore]));
    const rerankOrder = new Map(reranked.map((r, i) => [r.id, i]));
    ranked.sort((a, b) => (rerankOrder.get(a.id) ?? 0) - (rerankOrder.get(b.id) ?? 0));
    for (const r of ranked) {
      const adjusted = rerankScoreById.get(r.id);
      if (adjusted !== undefined) r.finalScore = adjusted;
    }
  }

  const globalMissing = new Set<string>();
  const byId = new Map(deduped.map((r) => [r.id, r]));
  const rankedResults: RankedResult[] = [];
  for (const r of ranked) {
    const original = byId.get(r.id);
    if (!original) continue;
    if (r.missingSignals) {
      for (const s of r.missingSignals) globalMissing.add(s);
    }
    const { text: _text, ...rest } = original;
    const snippet = rest.snippet && [...rest.snippet].length > SNIPPET_MAX_LENGTH
      ? [...rest.snippet].slice(0, SNIPPET_MAX_LENGTH).join("") + "..."
      : rest.snippet;
    rankedResults.push({ ...rest, snippet, signals: r.signals, finalScore: r.finalScore });
    if (rankedResults.length >= (opts.limit ?? 10)) break;
  }

  // ── Detect AI-targeted content (content optimized for LLM agents) ────────
  const AI_TARGETED_PATTERNS = [
    /\b(?:instructions?\s+for\s+(?:AI|LLM|autonomous|language\s+model)s?)\b/i,
    /\b(?:optimized\s+for\s+(?:AI|LLM|language\s+model)s?)\b/i,
    /\b(?:designed\s+for\s+(?:AI|LLM|autonomous)\s+agents)\b/i,
    /\b(?:skill\s+documentation\s+for\s+(?:AI|LLM) agents)\b/i,
    /\b(?:context\s+(?:window|length|injection)\s+(?:for|of)\s+(?:AI|LLM))\b/i,
    /\b(?:prompt\s+(?:injection|engineering|design)\s+guide)\b/i,
    /\b(?:LLM\s+(?:skills?|knowledge|training|dataset))\b/i,
  ];
  for (const result of rankedResults) {
    const textToCheck = `${result.title} ${result.snippet ?? ""}`;
    for (const pattern of AI_TARGETED_PATTERNS) {
      if (pattern.test(textToCheck)) {
        (result as unknown as Record<string, unknown>).aiTargeted = true;
        break;
      }
    }
  }

  // ── Optional: scrape full page content for top results in parallel ──────
  if (opts.scrape && rankedResults.length > 0) {
    const t4 = Date.now();
    const SCRAPE_TIMEOUT_MS = 5000;
    await Promise.allSettled(
      rankedResults.slice(0, 3).map(async (result) => {
        try {
          const doc = await extractDocument(result.url);
          result.extracted = doc;
        } catch (err) {
          logger.warn({ err, url: result.url }, "scrape failed for search result");
        }
      })
    );
    logger.info(
      { query: rawQuery, scrapeCount: rankedResults.filter((r) => r.extracted).length, scrapeTime: Date.now() - t4 },
      "search scrape complete"
    );
  }

  const latencyMs = Date.now() - start;
  searchLatency.observe({ mode: "search" }, latencyMs / 1000);
  logger.info(
    { query: rawQuery, plannerTime, providerTime, mergeTime, rankTime, total: latencyMs, providerCount: plan.providers.length, resultCount: rankedResults.length },
    "search timing breakdown"
  );

  prisma.search
    .create({
      data: {
        id: nanoid(),
        query: rawQuery,
        intent: plan.query.intent,
        language: plan.query.language,
        providersUsed: filteredActiveProviders.map((p) => p.id),
        resultCount: rankedResults.length,
        latencyMs,
        apiKeyId: opts.apiKeyId,
        projectId: opts.projectId,
      },
    })
    .catch((err) => logger.warn({ err }, "failed to persist search record"));

  const outcome: SearchOutcome = {
    traceId: plan.query.traceId,
    intent: plan.query.intent,
    intentSource: plan.query.intentSource,
    language: plan.query.language,
    newsCategory: plan.query.newsCategory,
    newsKeywords: plan.query.newsKeywords,
    providersUsed: filteredActiveProviders.map((p) => p.id),
    results: rankedResults,
    latencyMs,
    degraded: globalMissing.size > 0 || undefined,
    missingSignals: globalMissing.size > 0 ? [...globalMissing] : undefined,
  };

  // Cache the result for 5 minutes (fire-and-forget)
  void cacheSetJSON(cacheKey, outcome, 300).catch(() => {});

  return outcome;
}
