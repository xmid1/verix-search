import { nanoid } from "nanoid";
import type { ResearchAnswer, ReasoningGraphNode, Citation } from "../../core/types.js";
import { buildResearchPlan } from "./planner.js";
import { executeSearch } from "../search/orchestrator.js";
import { extractDocument } from "../extraction/index.js";
import { detectContradictions } from "./contradictions.js";
import { computeConfidence } from "./confidence.js";
import { synthesizeAnswer, collectCodeSnippets } from "./synthesis.js";
import { buildAndPersistKnowledgeGraph } from "./knowledgeGraph.js";
import { citationFromResult } from "../citation/index.js";
import { getSemanticCache, setSemanticCache } from "../knowledge/semanticCache.js";
import { prisma } from "../../infra/db.js";
import { childLogger } from "../../infra/logger.js";
import { searchLatency } from "../../infra/metrics.js";
import { noopEmit, type Emit } from "../streaming/events.js";
import { trustScore } from "../ranking/trust.js";

const logger = childLogger({ module: "research:orchestrator" });
const MAX_EXTRACTED_SOURCES = 6;
const MAX_RESULTS_PER_SUBQUESTION = 4;

export interface ResearchOptions {
  emit?: Emit;
  apiKeyId?: string;
  projectId?: string;
  useCache?: boolean;
}

/**
 * Deep Research Orchestrator (spec §9/§38/§64): Plan -> Search -> Extract ->
 * Detect contradictions -> Synthesize -> Score confidence -> persist +
 * build a lightweight knowledge graph. Emits StreamEvents at each stage so a
 * caller can surface live progress over SSE/WebSocket.
 */
export async function runDeepResearch(question: string, opts: ResearchOptions = {}): Promise<ResearchAnswer> {
  const emit = opts.emit ?? noopEmit;
  const start = Date.now();
  const reasoningGraph: ReasoningGraphNode[] = [{ step: "question", detail: question }];

  if (opts.useCache !== false) {
    const cached = await getSemanticCache<ResearchAnswer>(question);
    if (cached) {
      emit("done", "Answered from semantic cache", { cached: true });
      return cached;
    }
  }

  emit("planning", "Breaking the question into sub-questions");
  const plan = await buildResearchPlan(question);
  reasoningGraph.push({ step: "intent", detail: plan.intent });
  reasoningGraph.push({ step: "sub_questions", detail: plan.subQuestions.join(" | ") });

  emit("searching", `Searching ${plan.subQuestions.length} sub-question(s)`, { subQuestions: plan.subQuestions });
  const searchOutcomes = await Promise.all(
    plan.subQuestions.map((sq) => executeSearch(sq, { limit: MAX_RESULTS_PER_SUBQUESTION, apiKeyId: opts.apiKeyId, projectId: opts.projectId, quick: false }))
  );

  const seenUrls = new Set<string>();
  const topResults = searchOutcomes
    .flatMap((o) => o.results)
    .filter((r) => {
      if (seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, MAX_EXTRACTED_SOURCES);

  reasoningGraph.push({ step: "evidence_needed", detail: `${topResults.length} candidate sources selected for extraction` });

  emit("reading", `Extracting content from ${topResults.length} source(s)`);
  const extractedResults = await Promise.all(
    topResults.map(async (r) => {
      try {
        const doc = await extractDocument(r.url);
        return { result: r, doc };
      } catch (err) {
        logger.warn({ err, url: r.url }, "extraction failed for research source, using snippet only");
        return { result: r, doc: null };
      }
    })
  );

  emit("extracting", "Building source corpus");
  const sources = extractedResults.map(({ result, doc }) => ({
    url: result.url,
    title: doc?.title ?? result.title,
    trustScore: result.signals.trust,
    markdown: doc?.markdown ?? result.snippet ?? result.title,
    codeBlocks: doc?.codeBlocks ?? [],
  }));

  reasoningGraph.push({ step: "evidence_collection", detail: `${sources.length} sources extracted` });

  emit("comparing", "Checking sources for contradictions");
  const contradictions = await detectContradictions(
    question,
    sources.map((s) => ({ url: s.url, title: s.title, trustScore: s.trustScore, text: s.markdown }))
  );
  if (contradictions.length > 0) {
    reasoningGraph.push({ step: "conflict_detection", detail: `${contradictions.length} contradiction(s) found` });
  }

  emit("building_context", "Synthesizing final answer");
  const synthesis = await synthesizeAnswer({ question, sources });
  reasoningGraph.push({ step: "hypothesis", detail: "Draft answer synthesized from evidence corpus" });

  const citations: Citation[] = extractedResults.map(({ result, doc }) => citationFromResult(result, doc ?? undefined));
  const hasOfficialSource = citations.some((c) => (c.trustScore ?? 0) >= 95);
  const hasCodeExample = sources.some((s) => s.codeBlocks.length > 0);

  // Compute average AI relevance from the ranked results' signals
  const avgAiRelevance = topResults.length > 0
    ? topResults.reduce((s, r) => s + (r.signals.aiRelevance ?? 0), 0) / topResults.length
    : undefined;

  const confidence = computeConfidence({
    citations,
    contradictions,
    hasOfficialSource,
    hasCodeExample,
    aiRelevanceScore: avgAiRelevance,
    summary: synthesis.summary,
  });
  reasoningGraph.push({ step: "evidence_weighting", detail: `confidence=${confidence.score}` });
  reasoningGraph.push({ step: "verification", detail: contradictions.length === 0 ? "No contradictions detected" : "Contradictions flagged in answer" });
  reasoningGraph.push({ step: "final_answer", detail: "Answer assembled with citations and confidence report" });

  const answer: ResearchAnswer = {
    question,
    summary: synthesis.summary,
    keyFacts: synthesis.keyFacts,
    examples: synthesis.examples,
    warnings: synthesis.warnings,
    codeSnippets: collectCodeSnippets(sources),
    citations,
    contradictions,
    confidence,
    reasoningGraph,
  };

  const sessionId = nanoid();
  prisma.researchSession
    .create({
      data: {
        id: sessionId,
        question,
        summary: answer.summary,
        confidence: confidence.score,
        citationCount: citations.length,
        latencyMs: Date.now() - start,
        apiKeyId: opts.apiKeyId,
        projectId: opts.projectId,
      },
    })
    .then(() => buildAndPersistKnowledgeGraph(sessionId, question, answer.summary))
    .catch((err) => logger.warn({ err }, "failed to persist research session"));

  if (opts.useCache !== false) {
    void setSemanticCache(question, answer);
  }

  searchLatency.observe({ mode: "research" }, (Date.now() - start) / 1000);
  emit("done", "Research complete", { confidence: confidence.score, citationCount: citations.length });

  return answer;
}

export { trustScore };
