import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

declare global {
  // eslint-disable-next-line no-var
  var __verixPrisma__: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: env.SUPABASE_DATABASE_URL });

export const prisma =
  global.__verixPrisma__ ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  global.__verixPrisma__ = prisma;
}

let vectorReady: Promise<void> | null = null;

/** Ensures the pgvector extension exists. Called once at boot. */
export async function ensureVectorExtension(): Promise<void> {
  if (!vectorReady) {
    vectorReady = prisma
      .$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`)
      .then(() => {
        logger.info("pgvector extension ready");
      })
      .catch((err) => {
        logger.error({ err }, "failed to ensure pgvector extension");
        throw err;
      });
  }
  return vectorReady;
}

/** Cosine-similarity search over a chunk table column using raw SQL (Prisma has no native vector type support). */
export async function vectorSimilaritySearch(params: {
  table: "chunks" | "semantic_cache_entries";
  embedding: number[];
  limit: number;
}): Promise<Array<{ id: string; distance: number }>> {
  const vectorLiteral = `[${params.embedding.join(",")}]`;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; distance: number }>>(
    `SELECT id, embedding <=> '${vectorLiteral}'::vector AS distance
     FROM "${params.table === "chunks" ? "Chunk" : "SemanticCacheEntry"}"
     WHERE embedding IS NOT NULL
     ORDER BY distance ASC
     LIMIT ${Number(params.limit)}`
  );
  return rows;
}
