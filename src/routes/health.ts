import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../infra/db.js";
import { redis } from "../infra/cache.js";
import { metricsRegistry } from "../infra/metrics.js";
import { env } from "../config/env.js";
import { isCircuitOpen } from "../infra/circuitBreaker.js";
import { llmClient } from "../infra/llm.js";
import { embeddingProvider } from "../infra/embeddings.js";

const startedAt = Date.now();

async function checkLLM(): Promise<boolean> {
  try {
    await llmClient.chat.completions.create({ model: env.LLM_MODEL, messages: [{ role: "user", content: "ping" }], maxTokens: 1 } as any);
    return true;
  } catch { return false; }
}

async function checkEmbeddings(): Promise<boolean> {
  try { await embeddingProvider.embed(["ping"]); return true; }
  catch { return false; }
}

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/v1/health", { schema: { tags: ["System"], summary: "Liveness + dependency health check" } }, async () => {
    const [dbOk, redisOk, llmOk, embeddingOk] = await Promise.all([
      prisma.$queryRawUnsafe("SELECT 1").then(() => true).catch(() => false),
      redis.ping().then((r) => r === "PONG").catch(() => false),
      checkLLM(),
      checkEmbeddings(),
    ]);
    return {
      status: dbOk && redisOk && llmOk && embeddingOk ? "ok" : "degraded",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      dependencies: { database: dbOk, redis: redisOk, llm: llmOk, embeddings: embeddingOk },
      version: env.API_VERSION,
    };
  });

  fastify.get("/v1/health/providers", { schema: { hide: true } }, async () => {
    const { allProviders } = await import("../modules/providers/index.js");
    const results = await Promise.all(
      allProviders.map(async (p) => {
        const healthy = await p.health().catch(() => false);
        return { id: p.id, healthy, circuitOpen: isCircuitOpen(p.id) };
      })
    );
    return { timestamp: new Date().toISOString(), providers: results };
  });

  fastify.get("/v1/status", { schema: { tags: ["System"], summary: "Basic service status" } }, async () => ({
    service: "verix-search",
    version: env.API_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  }));

  fastify.get("/metrics", { schema: { hide: true } }, async (_request, reply) => {
    reply.header("Content-Type", metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
};

export default healthRoutes;
