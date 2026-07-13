import type { FastifyInstance } from "fastify";
import healthRoutes from "./health.js";
import searchRoutes from "./search.js";
import researchRoutes from "./research.js";
import extractRoutes from "./extract.js";
import rankRoutes from "./rank.js";
import embeddingsRoutes from "./embeddings.js";
import compressRoutes from "./compress.js";
import providersRoutes from "./providers.js";
import authRoutes from "./auth.js";
import wsRoutes from "./ws.js";
import batchResearchRoutes from "./batch-research.js";
import verifyRoutes from "./verify-claim.js";
import watchRoutes from "./watch.js";

export async function registerRoutes(fastify: FastifyInstance<any>): Promise<void> {
  await fastify.register(healthRoutes);
  await fastify.register(searchRoutes);
  await fastify.register(researchRoutes);
  await fastify.register(extractRoutes);
  await fastify.register(rankRoutes);
  await fastify.register(embeddingsRoutes);
  await fastify.register(compressRoutes);
  await fastify.register(providersRoutes);
  await fastify.register(authRoutes);
  await fastify.register(wsRoutes);
  await fastify.register(batchResearchRoutes);
  await fastify.register(verifyRoutes);
  await fastify.register(watchRoutes);
}
