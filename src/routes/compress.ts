import type { FastifyPluginAsync } from "fastify";
import { extractDocument } from "../modules/extraction/index.js";
import { compressContext } from "../modules/compression/index.js";
import { CompressRequestSchema, ErrorResponseSchema } from "./schemas.js";
import { childLogger } from "../infra/logger.js";

const logger = childLogger({ module: "routes:compress" });

const compressRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/compress",
    {
      preHandler: fastify.requireAuth("extraction"),
      schema: {
        tags: ["Compression"],
        summary: "Fetch, extract, and distill a set of URLs into key facts/examples/warnings/code relevant to a question",
        body: CompressRequestSchema,
        response: { 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request) => {
      const body = request.body as { question: string; urls: string[]; maxTokens?: number };
      const { question, urls, maxTokens } = body;

      const budget = maxTokens
        ? (await import("../modules/compression/tokenBudget.js")).computeTokenBudget(maxTokens)
        : null;

      const targetUrls = budget ? urls.slice(0, budget.maxResults) : urls;

      const documents = await Promise.all(
        targetUrls.map(async (url) => {
          try {
            const doc = await extractDocument(url);
            const markdown = budget ? doc.markdown.slice(0, budget.maxCharsPerResult * 4) : doc.markdown;
            return { url, title: doc.title, markdown, codeBlocks: doc.codeBlocks };
          } catch (err) {
            logger.warn({ err, url }, "skipping URL that failed to extract for compression");
            return null;
          }
        })
      );
      return compressContext(question, documents.filter((d): d is NonNullable<typeof d> => d !== null));
    }
  );

  // /v1/summarize is a thinner alias focused purely on prose summary rather
  // than the full structured compression payload.
  fastify.post(
    "/v1/summarize",
    {
      preHandler: fastify.requireAuth("extraction"),
      schema: {
        tags: ["Compression"],
        summary: "Summarize a set of URLs relevant to a question (alias of /v1/compress, key facts only)",
        body: CompressRequestSchema,
      },
    },
    async (request) => {
      const body = request.body as { question: string; urls: string[]; maxTokens?: number };
      const { question, urls, maxTokens } = body;

      const budget = maxTokens
        ? (await import("../modules/compression/tokenBudget.js")).computeTokenBudget(maxTokens)
        : null;

      const targetUrls = budget ? urls.slice(0, budget.maxResults) : urls;

      const documents = await Promise.all(
        targetUrls.map(async (url) => {
          try {
            const doc = await extractDocument(url);
            const markdown = budget ? doc.markdown.slice(0, budget.maxCharsPerResult * 4) : doc.markdown;
            return { url, title: doc.title, markdown, codeBlocks: doc.codeBlocks };
          } catch (err) {
            logger.warn({ err, url }, "skipping URL that failed to extract for summarization");
            return null;
          }
        })
      );
      const compressed = await compressContext(question, documents.filter((d): d is NonNullable<typeof d> => d !== null));
      return { summary: compressed.keyFacts.join(" "), keyFacts: compressed.keyFacts, warnings: compressed.warnings };
    }
  );
};

export default compressRoutes;
