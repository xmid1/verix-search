/**
 * AI-based relevance scoring.
 *
 * Sends ONE batched chatJSON call containing the query and all candidate
 * {id, title, snippet} entries. Asks the model to score each 0-100 based on
 * how well it answers the query.
 *
 * Returns Map<id, score/100> (0-1 normalized).
 *
 * On any failure (network, malformed JSON, unexpected shape), logs a warning
 * and returns an empty Map — callers must treat missing entries as neutral
 * (0.5) rather than crashing the ranking pipeline.
 */
import { chatJSON } from "../../infra/llm.js";
import { childLogger } from "../../infra/logger.js";

const log = childLogger({ module: "ranking" });

interface LLMRelevanceItem {
  id: string;
  relevance0to100: number;
}

export async function aiRelevanceScores(
  query: string,
  documents: { id: string; title: string; snippet: string }[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (documents.length === 0) return result;

  const candidateList = documents
    .map((d) => `- id: ${d.id}\n  title: ${d.title}\n  snippet: ${d.snippet}`)
    .join("\n");

  const prompt = `You are a relevance-scoring assistant. Given the search query below and a list of candidate documents, rate how well each document answers the query on a scale of 0 to 100.

Query: ${query}

Candidates:
${candidateList}

Return a JSON array where each element has exactly two fields:
  "id"               — the candidate id (string, unchanged)
  "relevance0to100"  — integer 0-100, how relevant the document is to the query

Example output format:
[{"id":"doc1","relevance0to100":87},{"id":"doc2","relevance0to100":42}]`;

  try {
    const items = await chatJSON<LLMRelevanceItem[]>(prompt, {
      maxTokens: Math.min(200 + documents.length * 30, 1500),
      timeoutMs: 5000,
    });

    if (!Array.isArray(items)) {
      log.warn({ query }, "aiRelevanceScores: LLM returned non-array");
      return result;
    }

    for (const item of items) {
      if (
        typeof item.id === "string" &&
        typeof item.relevance0to100 === "number" &&
        isFinite(item.relevance0to100)
      ) {
        // Normalize to 0-1; clamp in case model returns out-of-range values
        result.set(item.id, Math.min(Math.max(item.relevance0to100 / 100, 0), 1));
      }
    }
  } catch (err) {
    log.warn({ err, query }, "aiRelevanceScores: LLM call failed — returning empty map");
  }

  return result;
}
