import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import compress from "@fastify/compress";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import scalarApiReference from "@scalar/fastify-api-reference";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./config/env.js";
import { logger } from "./infra/logger.js";
import { redis } from "./infra/cache.js";
import { registerRoutes } from "./routes/index.js";

export async function buildApp() {
  const fastify = Fastify({ loggerInstance: logger, trustProxy: true }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(helmet, { contentSecurityPolicy: false });
  const corsOrigin = env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((o) => o.trim());
  await fastify.register(cors, { origin: corsOrigin });
  await fastify.register(compress);
  await fastify.register(sensible);
  await fastify.register(websocket);
  await fastify.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    redis,
    keyGenerator: (request) => request.auth?.apiKeyId ?? request.ip,
  });

  await fastify.register(import("./plugins/auth.js"));

  await fastify.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Verix Search API",
        version: env.API_VERSION,
        description:
          "AI-native search & research platform — hybrid search, deep multi-source research, extraction, and ranking, built for autonomous agents.",
      },
      servers: [{ url: `/` }],
      components: {
        securitySchemes: {
          apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
          bearerAuth: { type: "http", scheme: "bearer" },
        },
      },
      tags: [
        { name: "Search" },
        { name: "Research" },
        { name: "Extraction" },
        { name: "Ranking" },
        { name: "Embeddings" },
        { name: "Compression" },
        { name: "Auth" },
        { name: "System" },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await fastify.register(scalarApiReference, {
    routePrefix: "/api-reference",
    configuration: { spec: { url: "/openapi.json" } },
  });

  fastify.get("/openapi.json", { schema: { hide: true } }, async () => {
    try { return fastify.swagger(); } catch { return { openapi: "3.1.0", info: { title: "Verix Search API", version: "1.0.0" }, paths: {} }; }
  });

  await registerRoutes(fastify as any);

  fastify.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ err: error }, "unhandled request error");
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    reply.code(statusCode).send({
      error: statusCode >= 500 ? "internal_server_error" : "bad_request",
      message: statusCode >= 500 ? "An unexpected error occurred" : error.message,
    });
  });

  return fastify;
}
