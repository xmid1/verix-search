import type { FastifyPluginAsync } from "fastify";
import { extractDocument } from "../modules/extraction/index.js";
import { extractStructured } from "../modules/extraction/structured.js";
import { crawlUrl, crawlUrls } from "../modules/extraction/crawler.js";
import { ExtractRequestSchema, ExtractStructuredResponseSchema, CrawlRequestSchema, ErrorResponseSchema } from "./schemas.js";

const extractRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/extract",
    {
      preHandler: fastify.requireAuth("extraction"),
      schema: {
        tags: ["Extraction"],
        summary: "Fetch a URL and extract clean markdown, code blocks, and metadata. Optionally provide a JSON schema for structured extraction (like Firecrawl/Exa).",
        body: ExtractRequestSchema,
        response: { 401: ErrorResponseSchema, 403: ErrorResponseSchema, 422: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const body = request.body as { url: string; schema?: Record<string, unknown> };
      const { url, schema } = body;
      try {
        const doc = await extractDocument(url);
        if (schema) {
          return extractStructured(doc, schema as any);
        }
        return doc;
      } catch (err) {
        return reply.code(422).send({ error: "extraction_failed", message: (err as Error).message });
      }
    }
  );

  // /v1/crawl — upgraded to support multi-page crawling, sitemap discovery,
  // link following, and optional webhook callback (Firecrawl-compatible).
  fastify.post(
    "/v1/crawl",
    {
      preHandler: fastify.requireAuth("crawler"),
      schema: {
        tags: ["Extraction"],
        summary: "Crawl a URL or set of URLs with sitemap discovery, link following, and webhook support",
        body: CrawlRequestSchema,
        response: { 401: ErrorResponseSchema, 403: ErrorResponseSchema, 422: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        url?: string;
        urls?: string[];
        maxPages?: number;
        sameDomain?: boolean;
        includeSitemap?: boolean;
        maxDepth?: number;
        excludePatterns?: string[];
        webhookUrl?: string;
        webhookSecret?: string;
      };

      try {
        const opts = {
          maxPages: body.maxPages ?? 10,
          sameDomain: body.sameDomain ?? true,
          includeSitemap: body.includeSitemap ?? true,
          maxDepth: body.maxDepth ?? 3,
          excludePatterns: body.excludePatterns,
          webhookUrl: body.webhookUrl,
          webhookSecret: body.webhookSecret,
        };

        if (body.urls && body.urls.length > 0) {
          if (body.urls.length === 1) {
            return await crawlUrl(body.urls[0]!, opts);
          }
          return await crawlUrls(body.urls, opts);
        }

        if (body.url) {
          return await crawlUrl(body.url, opts);
        }


        return reply.code(422).send({ error: "validation_error", message: "Either 'url' or 'urls' field is required" });
      } catch (err) {
        return reply.code(422).send({ error: "crawl_failed", message: (err as Error).message });
      }
    }
  );
};

export default extractRoutes;
