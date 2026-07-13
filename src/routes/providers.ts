import type { FastifyPluginAsync } from "fastify";
import { allProviders } from "../modules/providers/index.js";

const providersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/v1/providers",
    {
      preHandler: fastify.requireAuth("search"),
      schema: { tags: ["System"], summary: "List configured search providers and their live health status" },
    },
    async () => {
      const results = await Promise.all(
        allProviders.map(async (p) => ({
          id: p.id,
          displayName: p.displayName,
          priority: p.priority,
          capabilities: p.capabilities(),
          healthy: await p.health().catch(() => false),
        }))
      );
      return { providers: results };
    }
  );
};

export default providersRoutes;
