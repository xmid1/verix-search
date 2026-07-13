import { createHash } from "node:crypto";
import pLimit from "p-limit";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";
import { extractDocument } from "./index.js";
import type { ExtractedDocument } from "../../core/types.js";
import { fetchResource } from "./fetcher.js";

const log = childLogger({ module: "crawler" });

export interface CrawlOptions {
  maxPages?: number;
  sameDomain?: boolean;
  includeSitemap?: boolean;
  jsRender?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  maxDepth?: number;
  excludePatterns?: string[];
}

export interface CrawlResult {
  url: string;
  documents: ExtractedDocument[];
  sitemapUrls?: string[];
  error?: string;
  durationMs: number;
  pagesCrawled: number;
  pagesSkipped: number;
}

const CRAWLER_USER_AGENT = "VerixCrawler/1.0 (research bot; +https://verix.dev)";
const DEFAULT_CONCURRENCY = 5;
const PAGE_TIMEOUT_MS = 15000;
const MAX_QUEUE_SIZE = 500;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.href.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function shouldExclude(url: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  const lower = url.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Extract sitemap URLs from a domain's robots.txt or sitemap.xml.
 * Recursively follows sitemap indexes.
 */
export async function extractSitemapUrls(baseUrl: string): Promise<string[]> {
  try {
    const parsed = new URL(baseUrl);
    const origin = parsed.origin;
    const sitemapCandidates = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/sitemaps/sitemap.xml`,
      `${origin}/robots.txt`,
    ];

    const found = new Set<string>();

    for (const candidate of sitemapCandidates) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(candidate, {
          signal: controller.signal,
          headers: { "User-Agent": CRAWLER_USER_AGENT },
        });
        clearTimeout(timer);
        if (!res.ok) continue;

        const text = await res.text();

        if (candidate.endsWith("robots.txt")) {
          const sitemapLines = text.match(/^Sitemap:\s*(.+)$/im);
          if (sitemapLines?.[1]) {
            const urls = await extractSitemapUrlsFromXml(sitemapLines[1].trim());
            for (const u of urls) found.add(u);
          }
        } else {
          const urls = await extractSitemapUrlsFromXml(text);
          for (const u of urls) found.add(u);
        }
      } catch {
        continue;
      }
    }

    return [...found];
  } catch {
    return [];
  }
}

async function extractSitemapUrlsFromXml(xmlText: string): Promise<string[]> {
  const sitemapIndex = xmlText.match(/<sitemap>[\s\S]*?<\/sitemap>/g);
  if (sitemapIndex) {
    const results = await Promise.all(
      sitemapIndex.map(async (entry) => {
        const loc = entry.match(/<loc>\s*([^<]+)\s*<\/loc>/)?.[1];
        if (!loc) return [];
        return extractSitemapUrlsFromXml(loc);
      })
    );
    return results.flat();
  }

  const urlEntries = xmlText.match(/<url>[\s\S]*?<\/url>/g);
  if (urlEntries) {
    return urlEntries
      .map((entry) => {
        const loc = entry.match(/<loc>\s*([^<]+)\s*<\/loc>/)?.[1];
        return loc ? normalizeUrl(loc) : null;
      })
      .filter((u): u is string => Boolean(u));
  }

  return [];
}

/**
 * Extract all links from a document's markdown + raw HTML.
 */
export async function extractAllLinks(url: string, html?: string): Promise<string[]> {
  const links = new Set<string>();

  if (html) {
    const hrefPattern = /<a\s[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefPattern.exec(html)) !== null) {
      try {
        const u = new URL(match[1]!);
        links.add(u.href);
      } catch {
        continue;
      }
    }
  }

  return [...links];
}

/**
 * Crawl a URL and extract content, following links with depth tracking.
 * Enhanced: adaptive concurrency, depth limits, exclusion patterns, better sitemap parsing.
 */
export async function crawlUrl(
  startUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const start = Date.now();
  const maxPages = options.maxPages ?? 10;
  const sameDomain = options.sameDomain ?? true;
  const includeSitemap = options.includeSitemap ?? true;
  const maxDepth = options.maxDepth ?? 3;
  const excludePatterns = options.excludePatterns;

  const baseHostname = new URL(startUrl).hostname;
  const visited = new Set<string>();
  const pageQueue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const documents: ExtractedDocument[] = [];
  let sitemapUrls: string[] | undefined;
  let skippedCount = 0;
  const extractedUrlsThisRun = new Set<string>();

  // Phase 1: Discover sitemap URLs
  if (includeSitemap) {
    try {
      sitemapUrls = await extractSitemapUrls(startUrl);
      if (sitemapUrls.length > 0) {
        log.info({ url: startUrl, sitemapCount: sitemapUrls.length }, "sitemap discovered");
        for (const su of sitemapUrls) {
          const nu = normalizeUrl(su);
          if (!visited.has(nu) && extractedUrlsThisRun.size < maxPages * 3) {
            pageQueue.push({ url: su, depth: 0 });
            extractedUrlsThisRun.add(nu);
          }
        }
      }
    } catch (err) {
      log.warn({ err, url: startUrl }, "sitemap extraction failed");
    }
  }

  const limiter = pLimit(DEFAULT_CONCURRENCY);

  async function processPage(entry: { url: string; depth: number }): Promise<void> {
    const norm = normalizeUrl(entry.url);
    if (visited.has(norm)) return;
    if (shouldExclude(entry.url, excludePatterns)) {
      skippedCount++;
      return;
    }

    visited.add(norm);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
      const doc = await extractDocument(entry.url);
      clearTimeout(timer);

      documents.push(doc);

      if (documents.length < maxPages && entry.depth < maxDepth) {
        const links = await extractAllLinks(entry.url);
        const markdownLinks = doc.markdown.match(/\[([^\]]*)\]\(((https?:\/\/)[^)]+)\)/g);
        if (markdownLinks) {
          for (const ml of markdownLinks) {
            const urlMatch = ml.match(/\]\(((https?:\/\/)[^)]+)\)/);
            if (urlMatch?.[1]) links.push(urlMatch[1]);
          }
        }

        for (const link of links) {
          try {
            const u = new URL(link);
            if (sameDomain && u.hostname !== baseHostname) continue;

            const nu = normalizeUrl(link);
            if (visited.has(nu) || extractedUrlsThisRun.has(nu)) continue;

            const skipExt = [".pdf", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".mp4", ".mp3", ".woff", ".woff2", ".ttf", ".ico"];
            const path = u.pathname.toLowerCase();
            if (skipExt.some((ext) => path.endsWith(ext))) continue;

            if (pageQueue.length + documents.length < MAX_QUEUE_SIZE) {
              pageQueue.push({ url: link, depth: entry.depth + 1 });
              extractedUrlsThisRun.add(nu);
            }
          } catch {
            continue;
          }
        }
      }
    } catch (err) {
      log.warn({ err, url: entry.url }, "crawl page failed — skipping");
    }
  }

  // Phase 2: Process queue with adaptive concurrency
  while (pageQueue.length > 0 && documents.length < maxPages) {
    const batchSize = Math.min(DEFAULT_CONCURRENCY, maxPages - documents.length);
    const batch = pageQueue.splice(0, batchSize);

    const tasks = batch.map((entry) =>
      limiter(() => processPage(entry))
    );
    await Promise.allSettled(tasks);
  }

  // Phase 3: Send webhook if configured
  if (options.webhookUrl) {
    try {
      const payload = {
        event: "crawl.complete",
        url: startUrl,
        pages: documents.length,
        skipped: skippedCount,
        durationMs: Date.now() - start,
        documents: documents.map((d) => ({
          url: d.url,
          title: d.title,
          textLength: d.textLength,
          codeBlocks: d.codeBlocks.length,
          contentHash: d.contentHash,
        })),
      };

      await fetch(options.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.webhookSecret
            ? { "X-Webhook-Secret": sha256Hex(options.webhookSecret) }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      log.info({ url: startUrl, pages: documents.length }, "crawl webhook delivered");
    } catch (err) {
      log.warn({ err, webhookUrl: options.webhookUrl }, "webhook delivery failed");
    }
  }

  return {
    url: startUrl,
    documents,
    sitemapUrls,
    durationMs: Date.now() - start,
    pagesCrawled: documents.length,
    pagesSkipped: skippedCount,
  };
}

/**
 * Parallel crawl with adaptive concurrency.
 */
export async function crawlUrls(
  urls: string[],
  options: CrawlOptions = {},
): Promise<CrawlResult[]> {
  const limiter = pLimit(DEFAULT_CONCURRENCY);

  const results = await Promise.allSettled(
    urls.map((url) =>
      limiter(() =>
        crawlUrl(url, options).catch((err) => ({
          url,
          documents: [],
          durationMs: 0,
          pagesCrawled: 0,
          pagesSkipped: 0,
          error: err instanceof Error ? err.message : String(err),
        } as CrawlResult))
      )
    )
  );

  return results.map((r) =>
    r.status === "fulfilled" ? r.value : {
      url: "unknown",
      documents: [],
      durationMs: 0,
      pagesCrawled: 0,
      pagesSkipped: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    } as CrawlResult
  );
}
