import type { Intent, ResearchPlan } from "../../core/types.js";
import { chatJSON } from "../../infra/llm.js";
import { detectIntent } from "../planner/intent.js";
import { detectLanguage } from "../planner/language.js";
import { env } from "../../config/env.js";
import { childLogger } from "../../infra/logger.js";

const logger = childLogger({ module: "research:planner" });

/**
 * Deep Research Planner (spec §9, §38, §64 "Planner" role): decomposes one
 * question into several concrete sub-questions to search independently,
 * mirroring how a human researcher would break down "Compare Bun vs Node.js
 * for production" into benchmarks / ecosystem / stability / tooling angles.
 */
export async function buildResearchPlan(question: string): Promise<ResearchPlan> {
  const intent = await detectIntent(question);
  const language = detectLanguage(question);

  let subQuestions: string[];
  try {
    subQuestions = await chatJSON<string[]>(
      `Break this research question into 3-6 focused sub-questions that together give a thorough, ` +
        `well-sourced answer. Question: "${question}". Return a JSON array of strings only.`,
      { model: env.LLM_PLANNER_MODEL, maxTokens: 400 }
    );
    if (!Array.isArray(subQuestions) || subQuestions.length === 0) throw new Error("empty plan");
  } catch (err) {
    logger.warn({ err }, "research planning LLM call failed, falling back to the raw question");
    subQuestions = [question];
  }

  return {
    question,
    subQuestions: subQuestions.slice(0, 6),
    intent: (typeof intent === "string" ? intent : "general") as Intent,
    language,
    providers: [],
    domainHints: [],
  };
}
