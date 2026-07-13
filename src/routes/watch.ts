import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createWatchSubscription, getWatchSubscription, deleteWatchSubscription } from "../modules/watch/index.js";
import { WatchRequestSchema, WatchResponseSchema, ErrorResponseSchema } from "./schemas.js";

const watchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/watch",
    {
      preHandler: fastify.requireAuth("search"),
      schema: {
        tags: ["Watch"],
        summary: "Create a watch subscription that monitors for new high-relevance results matching a query and sends webhook alerts",
        body: WatchRequestSchema,
        response: { 200: WatchResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const { query, threshold, webhookUrl, webhookSecret } = request.body as {
        query: string;
        threshold?: number;
        webhookUrl: string;
        webhookSecret?: string;
      };
      return createWatchSubscription(query, threshold ?? 70, webhookUrl, webhookSecret, request.auth?.apiKeyId);
    }
  );

  fastify.get(
    "/v1/watch/:id",
    {
      preHandler: fastify.requireAuth("search"),
      schema: {
        tags: ["Watch"],
        summary: "Get details of a watch subscription",
        response: { 200: WatchResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const sub = await getWatchSubscription(id);
      if (!sub) {
        return reply.code(404).send({ error: "not_found", message: "Watch subscription not found" });
      }
      return sub;
    }
  );

  fastify.delete(
    "/v1/watch/:id",
    {
      preHandler: fastify.requireAuth("search"),
      schema: {
        tags: ["Watch"],
        summary: "Delete a watch subscription",
        response: { 200: z.object({ deleted: z.boolean() }), 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await deleteWatchSubscription(id);
      return { deleted: true };
    }
  );
};

export default watchRoutes;
