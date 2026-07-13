import type { Intent } from "../../core/types.js";
import { chatJSON } from "../../infra/llm.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

const logger = childLogger({ module: "planner:expansion" });

/**
 * Turns a single query into several concrete search variants (synonyms,
 * related terminology, alternate phrasing) so the provider layer casts a
 * wider net than a single literal string. Falls back to just [query] if the
 * LLM call fails — expansion is an enhancement, not a hard requirement.
 */
export async function expandQuery(query: string, intent: Intent): Promise<string[]> {
  try {
    const variants = await chatJSON<string[]>(
      `Generate short alternative search queries for: "${query}". Return JSON array of strings.`,
      { model: env.LLM_PLANNER_MODEL, maxTokens: 150 }
    );
    if (!Array.isArray(variants)) throw new Error("expected array");
    const cleaned = variants.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 6);
    return [query, ...cleaned];
  } catch (err) {
    logger.warn({ err }, "query expansion failed, using raw query only");
    return [query];
  }
}
