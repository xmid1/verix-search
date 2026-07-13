import type { FastifyPluginAsync } from "fastify";
import { createBatchJob, getBatchJob } from "../modules/research/batch.js";
import { BatchResearchRequestSchema, BatchResearchStatusSchema, ErrorResponseSchema } from "./schemas.js";

const batchResearchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/research/batch",
    {
      preHandler: fastify.requireAuth("research"),
      schema: {
        tags: ["Research"],
        summary: "Submit multiple research questions for async batch processing with optional webhook",
        body: BatchResearchRequestSchema,
        response: { 200: BatchResearchStatusSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const { questions, webhookUrl } = request.body as { questions: string[]; webhookUrl?: string };
      return createBatchJob(questions, webhookUrl);
    }
  );

  fastify.get(
    "/v1/research/batch/:jobId",
    {
      preHandler: fastify.requireAuth("research"),
      schema: {
        tags: ["Research"],
        summary: "Poll the status and results of a batch research job",
        response: { 200: BatchResearchStatusSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const job = await getBatchJob(jobId);
      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Batch job not found" });
      }
      return job;
    }
  );
};

export default batchResearchRoutes;
