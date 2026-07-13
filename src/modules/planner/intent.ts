import { createHash } from "node:crypto";
import type { Intent } from "../../core/types.js";
import { chatText } from "../../infra/llm.js";
import { redis } from "../../infra/cache.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

const logger = childLogger({ module: "planner:intent" });

const VALID_INTENTS: Intent[] = [
  "programming",
  "research",
  "documentation",
  "package",
  "github",
  "security",
  "debugging",
  "api",
  "architecture",
  "academic",
  "news",
  "general",
  "comparison",
  "tutorial",
  "reference",
];

/** Fast heuristic pass — keyword matching, no network call. */
const HEURISTICS: Array<{ intent: Intent; regex: RegExp }> = [
  // Research patterns must precede programming to catch terms like "ReAct"
  // (reasoning agent) before the react (JS library) pattern fires.
  { intent: "research", regex: /\b(ReAct|Reflexion|CodeAct)\b/ },
  // Programming must come first — catches language names before other intents
  { intent: "programming", regex: /\b(typescript|javascript|ecmascript|js|ts|jsx|tsx)\b/i },
  { intent: "programming", regex: /\b(python|rust|golang|java|ruby|php|swift|kotlin|scala|perl|haskell|elixir|clojure|dart|lua)\b/i },
  { intent: "programming", regex: /\b(c#|c\+\+)/i },
  { intent: "programming", regex: /\b(react|vue|angular|svelte|nextjs|nuxt|remix|solidjs|qwik)\b/i },
  { intent: "programming", regex: /\b(django|spring|laravel|flask|fastapi|express|nestjs|rails|dotnet)\b/i },
  { intent: "programming", regex: /\b(docker|kubernetes|devops|ci\/cd|terraform|ansible)\b/i },
  { intent: "programming", regex: /\b(generics|function|class|interface|type|variable|syntax|compile|runtime)\b/i },
  { intent: "programming", regex: /\b(best practices|code|programming|coding|software development|web dev)\b/i },
  { intent: "programming", regex: /\b(api|endpoint|sdk|framework|library|module|package|npm|pip|cargo|nuget)\b/i },
  { intent: "package", regex: /\b(npm|pypi|package|install|dependency)\b/i },
  { intent: "github", regex: /\bgithub\b|\brepo(sitory)?\b/i },
  { intent: "security", regex: /\b(vulnerab|cve|exploit|xss|csrf|injection|security)\b/i },
  { intent: "debugging", regex: /\b(error|exception|stack trace|bug|fix|not working|crash)\b/i },
  { intent: "research", regex: /\b(SWE.?agent|OpenHands|OpenDevin|AutoGPT|CrewAI|LangGraph|MetaGPT)\b/i },
  { intent: "research", regex: /\b(memory.*tool.*planning.*execution.*self.?correction)\b/i },
  { intent: "research", regex: /\b(best.*open.?source.*project.*paper|open.?source.*project.*agent)\b/i },
  { intent: "research", regex: /\b(repository.?level.*code.*gen|autonomous.*coding.*agent)\b/i },
  { intent: "academic", regex: /\b(paper|arxiv|study|research paper|citation|state.?of.?the.?art)\b/i },
  { intent: "research", regex: /\b(LLM.*benchmark|agent.*benchmark|SOTA.*LLM|survey.*LLM)\b/i },
  { intent: "news", regex: /\b(news|announc|release[ds]?|latest)\b/i },
  { intent: "comparison", regex: /\bvs\.?\b|\bversus\b|\bcompare[ds]?\b|\bwhich is better\b/i },
  { intent: "tutorial", regex: /\bhow to\b|\btutorial\b|\bguide\b|\bwalkthrough\b/i },
  { intent: "architecture", regex: /\barchitecture\b|\bdesign pattern\b|\bsystem design\b/i },
  { intent: "documentation", regex: /\bdocs?\b|\bdocumentation\b/i },
];

/** In-memory intent cache keyed by sha256(query). */
const intentCache = new Map<string, { intent: Intent; source: "regex" | "llm" | "cache" }>();

export async function detectIntent(query: string): Promise<{ intent: Intent; source: "regex" | "llm" | "cache" }> {
  // In-memory cache: same query text → same intent (prevents LLM non-determinism)
  const cacheKey = createHash("sha256").update(query.trim().toLowerCase()).digest("hex");
  const cached = intentCache.get(cacheKey);
  if (cached) {
    logger.debug({ intent: cached.intent, source: "cache" }, "intent served from in-memory cache");
    return { intent: cached.intent, source: "cache" };
  }

  // Try Redis cache as well
  try {
    const redisCached = await redis.get(`intent:${cacheKey}`);
    if (redisCached) {
      const parsed = JSON.parse(redisCached) as { intent: Intent; source: "regex" | "llm" | "cache" };
      intentCache.set(cacheKey, parsed);
      logger.debug({ intent: parsed.intent, source: "cache" }, "intent served from Redis cache");
      return parsed;
    }
  } catch { /* Redis unavailable — proceed without */ }

  for (const { intent, regex } of HEURISTICS) {
    if (regex.test(query)) {
      const result = { intent, source: "regex" as const };
      intentCache.set(cacheKey, result);
      void redis.set(`intent:${cacheKey}`, JSON.stringify(result), "EX", 3600).catch(() => {});
      logger.debug({ intent, source: "regex", query }, "intent classified by heuristic");
      return result;
    }
  }

  // Ambiguous — ask the LLM for a single classification word, with a safe default.
  try {
    const raw = await chatText(
      `Classify this search query into exactly one category from this list: ${VALID_INTENTS.join(", ")}.\nQuery: "${query}"\nRespond with only the category word, nothing else.`,
      { model: env.LLM_PLANNER_MODEL, maxTokens: 10, temperature: 0 }
    );
    const cleaned = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
    const match = VALID_INTENTS.find((i) => i === cleaned);
    const intent = match ?? "general";
    const result = { intent, source: "llm" as const };
    intentCache.set(cacheKey, result);
    void redis.set(`intent:${cacheKey}`, JSON.stringify(result), "EX", 3600).catch(() => {});
    logger.debug({ intent, source: "llm", query, llmRaw: raw, llmCleaned: cleaned }, "intent classified by LLM");
    return result;
  } catch (err) {
    logger.warn({ err, query, source: "llm-fallback" }, "intent classification LLM call failed, defaulting to general");
    return { intent: "general", source: "llm" };
  }
}
