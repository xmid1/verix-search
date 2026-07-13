import type { FastifyPluginAsync } from "fastify";
import { embeddingProvider } from "../infra/embeddings.js";
import { EmbeddingsRequestSchema, ErrorResponseSchema } from "./schemas.js";

const embeddingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/embeddings",
    {
      preHandler: fastify.requireAuth("search"),
      schema: {
        tags: ["Embeddings"],
        summary: "Compute embedding vectors for one or more texts using the configured provider",
        body: EmbeddingsRequestSchema,
        response: { 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const { texts } = request.body as { texts: string[] };
      const vectors = await embeddingProvider.embed(texts);
      return { provider: embeddingProvider.id, dimensions: embeddingProvider.dimensions, vectors };
    }
  );
};

export default embeddingsRoutes;
