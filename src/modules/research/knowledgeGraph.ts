import { nanoid } from "nanoid";
import { chatJSON } from "../../infra/llm.js";
import { env } from "../../config/env.js";
import { prisma } from "../../infra/db.js";
import { childLogger } from "../../infra/logger.js";

const logger = childLogger({ module: "research:knowledge-graph" });

interface GraphExtraction {
  nodes: Array<{ label: string; type: string }>;
  edges: Array<{ source: string; target: string; relation: string }>;
}

/**
 * Knowledge Graph Engine (spec §41): after a research session, extracts the
 * key concepts and their relationships (e.g. React -> hasFeature -> Hooks)
 * so future related queries can reuse this structure instead of re-deriving it.
 */
export async function buildAndPersistKnowledgeGraph(sessionId: string, topic: string, summary: string): Promise<void> {
  try {
    const graph = await chatJSON<GraphExtraction>(
      `Topic: "${topic}"\nSummary:\n${summary}\n\n` +
        `Extract a small knowledge graph as JSON: { nodes: [{label, type}], edges: [{source, target, relation}] }. ` +
        `Use "label" values from nodes as source/target in edges. Keep it to at most 12 nodes and 15 edges — the most important concepts only.`,
      { model: env.LLM_RESEARCH_MODEL, maxTokens: 700 }
    );
    if (!graph?.nodes?.length) return;

    const idByLabel = new Map<string, string>();
    for (const node of graph.nodes.slice(0, 12)) {
      const id = nanoid();
      idByLabel.set(node.label, id);
      await prisma.knowledgeNode.create({
        data: { id, sessionId, label: node.label, type: node.type ?? "concept" },
      });
    }
    for (const edge of (graph.edges ?? []).slice(0, 15)) {
      const sourceId = idByLabel.get(edge.source);
      const targetId = idByLabel.get(edge.target);
      if (!sourceId || !targetId) continue;
      await prisma.knowledgeEdge.create({
        data: { id: nanoid(), sourceId, targetId, relation: edge.relation },
      });
    }
  } catch (err) {
    logger.warn({ err }, "knowledge graph extraction failed — skipping (non-critical)");
  }
}
