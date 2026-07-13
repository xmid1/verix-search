import type { FastifyPluginAsync } from "fastify";
import { executeSearch } from "../modules/search/orchestrator.js";
import { SearchRequestSchema, SearchResponseSchema, ErrorResponseSchema } from "./schemas.js";
import { computeTokenBudget, truncateToBudget } from "../modules/compression/tokenBudget.js";

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/search",
    {
      preHandler: fastify.requireAuth("search"),
      schema: {
        tags: ["Search"],
        summary: "Search across all configured providers with hybrid ranking",
        body: SearchRequestSchema,
        response: { 200: SearchResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const body = request.body as { query: string; limit?: number; scrape?: boolean; maxTokens?: number };
      const { query, limit, scrape, maxTokens } = body;

      let effectiveLimit = limit;
      if (maxTokens) {
        const budget = computeTokenBudget(maxTokens);
        effectiveLimit = Math.min(effectiveLimit ?? 10, budget.maxResults);
      }

      const outcome = await executeSearch(query, {
        limit: effectiveLimit,
        scrape,
        apiKeyId: request.auth?.apiKeyId,
        projectId: request.auth?.projectId ?? undefined,
      });

      if (maxTokens && outcome.results.length > 0) {
        const budget = computeTokenBudget(maxTokens);
        const truncated = truncateToBudget(
          outcome.results.map((r) => ({ url: r.url, title: r.title, snippet: r.snippet })),
          budget
        );
        outcome.results = outcome.results.filter((r) =>
          truncated.some((t) => t.url === r.url)
        );
      }

      return outcome;
    }
  );
};

export default searchRoutes;
