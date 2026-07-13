import { childLogger } from "../../infra/logger.js";
import { chatJSON } from "../../infra/llm.js";
import { env } from "../../config/env.js";
import { executeSearch } from "../search/orchestrator.js";
import { extractDocument } from "../extraction/index.js";
import { synthesizeAnswer } from "./synthesis.js";
import { detectContradictions } from "./contradictions.js";
import { computeConfidence } from "./confidence.js";
import { citationFromResult } from "../citation/index.js";
import type { ResearchAnswer, ReasoningGraphNode, Citation } from "../../core/types.js";
import type { ResearchOptions } from "./index.js";
import { buildResearchPlan } from "./planner.js";

const log = childLogger({ module: "research:multihop" });

interface MultiHopContext {
  question: string;
  depth: number;
  currentDepth: number;
  accumulatedSources: Array<{ url: string; title: string; trustScore: number; markdown: string; codeBlocks: any[] }>;
  unknowns: string[];
  reasoningGraph: ReasoningGraphNode[];
}

export async function runMultiHopResearch(question: string, depth: number, opts: ResearchOptions = {}): Promise<ResearchAnswer> {
  const context: MultiHopContext = {
    question,
    depth,
    currentDepth: 0,
    accumulatedSources: [],
    unknowns: [],
    reasoningGraph: [{ step: "question", detail: question }],
  };

  return recurseResearch(context, opts);
}

async function recurseResearch(ctx: MultiHopContext, opts: ResearchOptions): Promise<ResearchAnswer> {
  ctx.reasoningGraph.push({ step: "intent", detail: `Depth ${ctx.currentDepth + 1}/${ctx.depth}` });

  const plan = await buildResearchPlan(ctx.question);
  ctx.reasoningGraph.push({ step: "sub_questions", detail: plan.subQuestions.join(" | ") });

  const searchOutcomes = await Promise.all(
    plan.subQuestions.map((sq) => executeSearch(sq, { limit: 4, apiKeyId: opts.apiKeyId, projectId: opts.projectId, quick: false }))
  );

  const seenUrls = new Set(ctx.accumulatedSources.map((s) => s.url));
  const topResults = searchOutcomes
    .flatMap((o) => o.results)
    .filter((r) => {
      if (seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 6);

  const extractedResults = await Promise.all(
    topResults.map(async (r) => {
      try {
        const doc = await extractDocument(r.url);
        ctx.accumulatedSources.push({
          url: r.url,
          title: doc.title,
          trustScore: r.signals.trust,
          markdown: doc.markdown,
          codeBlocks: doc.codeBlocks,
        });
        return { result: r, doc };
      } catch (err) {
        log.warn({ err, url: r.url }, "extraction failed in multihop research");
        ctx.accumulatedSources.push({
          url: r.url,
          title: r.title,
          trustScore: r.signals.trust,
          markdown: r.snippet ?? r.title,
          codeBlocks: [],
        });
        return { result: r, doc: null };
      }
    })
  );

  ctx.reasoningGraph.push({ step: "evidence_collection", detail: `${ctx.accumulatedSources.length} total sources across ${ctx.currentDepth + 1} hop(s)` });

  const contradictions = await detectContradictions(
    ctx.question,
    ctx.accumulatedSources.map((s) => ({ url: s.url, title: s.title, trustScore: s.trustScore, text: s.markdown }))
  );

  const synthesis = await synthesizeAnswer({
    question: ctx.question,
    sources: ctx.accumulatedSources,
  });

  const citations: Citation[] = extractedResults.map(({ result, doc }) => citationFromResult(result, doc ?? undefined));
  const hasOfficialSource = citations.some((c) => (c.trustScore ?? 0) >= 95);
  const hasCodeExample = ctx.accumulatedSources.some((s) => s.codeBlocks.length > 0);

  const avgScore = ctx.accumulatedSources.length > 0
    ? ctx.accumulatedSources.reduce((s, src) => s + src.trustScore, 0) / ctx.accumulatedSources.length
    : undefined;

  const confidence = computeConfidence({
    citations,
    contradictions,
    hasOfficialSource,
    hasCodeExample,
    aiRelevanceScore: avgScore,
    summary: synthesis.summary,
  });

  ctx.unknowns = confidence.unknowns;

  if (ctx.currentDepth < ctx.depth - 1 && ctx.unknowns.length > 0) {
    log.info({ unknowns: ctx.unknowns, depth: ctx.currentDepth + 1 }, "multi-hop: recursing with unknowns");
    ctx.reasoningGraph.push({ step: "verification", detail: `${ctx.unknowns.length} unknowns found, recursing` });

    const subQuestions = await generateSubQuestions(ctx.question, ctx.unknowns);
    plan.subQuestions = subQuestions;
    ctx.currentDepth++;
    return recurseResearch(ctx, opts);
  }

  ctx.reasoningGraph.push({ step: "verification", detail: ctx.unknowns.length === 0 ? "No unknowns remaining" : `${ctx.unknowns.length} unknowns remain` });
  ctx.reasoningGraph.push({ step: "final_answer", detail: "Multi-hop answer assembled" });

  return {
    question: ctx.question,
    summary: synthesis.summary,
    keyFacts: synthesis.keyFacts,
    examples: synthesis.examples,
    warnings: synthesis.warnings,
    codeSnippets: ctx.accumulatedSources.flatMap((s) => s.codeBlocks.filter((b: any) => b.language)),
    citations,
    contradictions,
    confidence,
    reasoningGraph: ctx.reasoningGraph,
  };
}

async function generateSubQuestions(originalQuestion: string, unknowns: string[]): Promise<string[]> {
  const result = await chatJSON<{ subQuestions: string[] }>(
    `Original research question: "${originalQuestion}"

The following gaps (unknowns) remain in the current answer:
${unknowns.map((u, i) => `${i + 1}. ${u}`).join("\n")}

Generate 2-4 specific search sub-questions that, if answered, would fill these gaps.
Each sub-question should be focused, search-engine friendly, and directly address one or more unknowns.

Return JSON: { "subQuestions": string[] }`,
    { model: env.LLM_RESEARCH_MODEL, maxTokens: 500, temperature: 0.2 }
  );
  return result.subQuestions ?? unknowns;
}
