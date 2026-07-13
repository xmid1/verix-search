import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { prisma, vectorSimilaritySearch } from "../../infra/db.js";
import { embeddingProvider } from "../../infra/embeddings.js";
import { cacheHits } from "../../infra/metrics.js";
import { childLogger } from "../../infra/logger.js";

const logger = childLogger({ module: "semantic-cache" });
const SIMILARITY_THRESHOLD = 0.92; // cosine distance <=> operator returns 1 - cosine similarity for pgvector
const DISTANCE_THRESHOLD = 1 - SIMILARITY_THRESHOLD;

export async function getSemanticCache<T>(queryText: string): Promise<T | null> {
  const queryHash = createHash("sha256").update(queryText.trim().toLowerCase()).digest("hex");

  const exact = await prisma.semanticCacheEntry.findUnique({ where: { queryHash } });
  if (exact) {
    await bumpHit(exact.id);
    cacheHits.inc();
    return exact.resultJson as T;
  }

  try {
    const [embedding] = await embeddingProvider.embed([queryText]);
    if (!embedding) return null;
    const candidates = await vectorSimilaritySearch({ table: "semantic_cache_entries", embedding, limit: 1 });
    const best = candidates[0];
    if (best && best.distance <= DISTANCE_THRESHOLD) {
      const entry = await prisma.semanticCacheEntry.findUnique({ where: { id: best.id } });
      if (entry) {
        await bumpHit(entry.id);
        cacheHits.inc();
        return entry.resultJson as T;
      }
    }
  } catch (err) {
    logger.warn({ err }, "semantic cache lookup failed, treating as miss");
  }
  return null;
}

export async function setSemanticCache(queryText: string, result: unknown, ttlHours = 24 * 7): Promise<void> {
  const queryHash = createHash("sha256").update(queryText.trim().toLowerCase()).digest("hex");
  try {
    const [embedding] = await embeddingProvider.embed([queryText]);
    const id = nanoid();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SemanticCacheEntry" (id, "queryHash", "queryText", embedding, "resultJson", "hitCount", "createdAt", "expiresAt")
       VALUES ($1, $2, $3, $4::vector, $5::jsonb, 0, now(), now() + interval '${ttlHours} hours')
       ON CONFLICT ("queryHash") DO UPDATE SET "resultJson" = EXCLUDED."resultJson", "expiresAt" = EXCLUDED."expiresAt"`,
      id,
      queryHash,
      queryText,
      embedding ? `[${embedding.join(",")}]` : null,
      JSON.stringify(result)
    );
  } catch (err) {
    logger.warn({ err }, "failed to write semantic cache entry");
  }
}

async function bumpHit(id: string): Promise<void> {
  await prisma.semanticCacheEntry.update({ where: { id }, data: { hitCount: { increment: 1 } } }).catch(() => {});
}
