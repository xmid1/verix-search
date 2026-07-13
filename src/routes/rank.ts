import type { FastifyPluginAsync } from "fastify";
import { rankResults } from "../modules/ranking/index.js";
import { RankRequestSchema, ErrorResponseSchema } from "./schemas.js";

const rankRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/rank",
    {
      preHandler: fastify.requireAuth("search"),
      schema: {
        tags: ["Ranking"],
        summary: "Score and rank a caller-supplied candidate list against a query",
        body: RankRequestSchema,
        response: { 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const { query, candidates } = request.body as {
        query: string;
        candidates: Array<{ id: string; url: string; title: string; snippet?: string; publishedAt?: string }>;
      };
      return rankResults(query, candidates);
    }
  );

  // /v1/rerank is a semantic alias — agents commonly distinguish "rank" (fresh
  // scoring) from "rerank" (re-scoring an existing ordered list); the
  // underlying signal computation is identical.
  fastify.post(
    "/v1/rerank",
    {
      preHandler: fastify.requireAuth("search"),
      schema: {
        tags: ["Ranking"],
        summary: "Re-score a candidate list against a query (alias of /v1/rank)",
        body: RankRequestSchema,
        response: { 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const { query, candidates } = request.body as {
        query: string;
        candidates: Array<{ id: string; url: string; title: string; snippet?: string; publishedAt?: string }>;
      };
      return rankResults(query, candidates);
    }
  );
};

export default rankRoutes;
