import type { FastifyPluginAsync } from "fastify";
import { runDeepResearch } from "../modules/research/index.js";
import { runMultiHopResearch } from "../modules/research/multihop.js";
import { createEmitter } from "../modules/streaming/events.js";
import { ResearchRequestSchema, ResearchResponseSchema, ErrorResponseSchema } from "./schemas.js";
import type { ResearchAnswer } from "../core/types.js";

function estimateAnswerTokens(answer: ResearchAnswer): number {
  const text = [
    answer.summary,
    ...answer.keyFacts,
    ...answer.examples,
    ...answer.warnings,
    ...answer.citations.map((c) => `${c.title} ${c.snippet ?? ""}`),
  ].join(" ");
  return Math.ceil(text.length * 0.25);
}

const researchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/research",
    {
      preHandler: fastify.requireAuth("research"),
      schema: {
        tags: ["Research"],
        summary: "Deep multi-source research: plan, search, extract, synthesize, score confidence. Supports depth parameter for multi-hop recursive research.",
        body: ResearchRequestSchema,
        response: { 200: ResearchResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const body = request.body as { question: string; useCache?: boolean; depth?: number; maxTokens?: number };
      const { question, useCache, depth, maxTokens } = body;

      if (depth && depth > 1) {
        return runMultiHopResearch(question, depth, {
          useCache,
          apiKeyId: request.auth?.apiKeyId,
          projectId: request.auth?.projectId ?? undefined,
        });
      }

      const answer = await runDeepResearch(question, {
        useCache,
        apiKeyId: request.auth?.apiKeyId,
        projectId: request.auth?.projectId ?? undefined,
      });

      if (maxTokens) {
        const tokens = estimateAnswerTokens(answer);
        if (tokens > maxTokens) {
          answer.summary = answer.summary.slice(0, Math.floor(maxTokens * 4));
        }
      }

      return answer;
    }
  );

  // Server-Sent Events variant — streams StreamEvent progress updates, then the final answer.
  fastify.get(
    "/v1/research/stream",
    {
      preHandler: fastify.requireAuth("research"),
      schema: {
        tags: ["Research"],
        summary: "Same as /v1/research but streams progress via Server-Sent Events",
        querystring: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
      },
    },
    async (request, reply) => {
      const { question } = request.query as { question: string };

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const emit = createEmitter((event) => {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      try {
        const answer = await runDeepResearch(question, {
          emit,
          apiKeyId: request.auth?.apiKeyId,
          projectId: request.auth?.projectId ?? undefined,
        });
        reply.raw.write(`event: result\ndata: ${JSON.stringify(answer)}\n\n`);
      } catch (err) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
      } finally {
        reply.raw.end();
      }
    }
  );
};

export default researchRoutes;
