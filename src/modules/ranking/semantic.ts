import { embeddingProvider, cosineSimilarity } from "../../infra/embeddings.js";
import { childLogger } from "../../infra/logger.js";

const log = childLogger({ module: "ranking" });

export async function semanticSimilarityScores(
  query: string,
  documents: { id: string; text: string }[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (documents.length === 0) return result;

  const texts = [query, ...documents.map((d) => d.text)];
  let embeddings: number[][];
  try {
    embeddings = await embeddingProvider.embed(texts);
  } catch (err) {
    log.warn({ err, query }, "semanticSimilarityScores: embedding failed — returning empty map");
    return result;
  }

  if (!embeddings || embeddings.length < 1 + documents.length) {
    log.warn({ query, got: embeddings?.length, expected: 1 + documents.length }, "semanticSimilarityScores: unexpected embedding count");
    return result;
  }

  const queryEmbedding = embeddings[0]!;

  for (let i = 0; i < documents.length; i++) {
    const docEmbedding = embeddings[i + 1]!;
    const cosine = cosineSimilarity(queryEmbedding, docEmbedding);
    const normalized = (cosine + 1) / 2;
    result.set(documents[i]!.id, normalized);
  }

  return result;
}
