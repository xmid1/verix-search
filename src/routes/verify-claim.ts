import type { FastifyPluginAsync } from "fastify";
import { verifyClaim } from "../modules/verification/index.js";
import { VerifyClaimRequestSchema, VerifyClaimResponseSchema, ErrorResponseSchema } from "./schemas.js";

const verifyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/verify-claim",
    {
      preHandler: fastify.requireAuth("research"),
      schema: {
        tags: ["Verification"],
        summary: "Verify whether a textual claim is supported by a given source URL using LLM analysis of extracted content",
        body: VerifyClaimRequestSchema,
        response: { 200: VerifyClaimResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 422: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { claim, sourceUrl } = request.body as { claim: string; sourceUrl: string };
      try {
        return await verifyClaim(claim, sourceUrl);
      } catch (err) {
        return reply.code(422).send({ error: "verification_failed", message: (err as Error).message });
      }
    }
  );
};

export default verifyRoutes;
