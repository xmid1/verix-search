import { createHash } from "node:crypto";
import { childLogger } from "../../infra/logger.js";
import type { ExtractedDocument } from "../../core/types.js";
import { fetchResource } from "./fetcher.js";
import { extractReadableContent } from "./htmlCleaner.js";
import { htmlToMarkdown } from "./markdown.js";
import { extractCodeBlocks } from "./codeExtractor.js";
import { extractPdfText } from "./pdf.js";

const log = childLogger({ module: "extraction" });

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Wrap arbitrary text in a fenced code block if it appears to be JSON or
 * code-like content (starts with { [ or contains multiple semicolons/braces).
 */
function wrapIfCode(text: string, contentType: string): string {
  const trimmed = text.trimStart();
  if (contentType.includes("json") || /^[\[{]/.test(trimmed)) {
    return "```json\n" + text + "\n```";
  }
  return text;
}

export async function extractDocument(url: string): Promise<ExtractedDocument> {
  log.info({ url }, "extractDocument started");

  const { contentType, buffer, finalUrl } = await fetchResource(url);
  const fetchedAt = new Date().toISOString();

  // Normalise content-type: strip parameters like "; charset=utf-8"
  const mimeType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  let markdown: string;
  let title = "";
  let author: string | undefined;
  let publishedAt: string | undefined;
  let codeBlocks: ReturnType<typeof extractCodeBlocks> = [];

  if (mimeType === "application/pdf") {
    // ── PDF path ──────────────────────────────────────────────────────────────
    const { text, numPages } = await extractPdfText(buffer);
    markdown = text;
    const metadata: Record<string, unknown> = { contentType, fetchedAt, numPages };
    const contentHash = sha256Hex(markdown);

    return {
      url: finalUrl,
      title,
      markdown,
      textLength: markdown.length,
      codeBlocks: [],
      publishedAt,
      author,
      metadata,
      contentHash,
    };
  } else if (
    mimeType === "text/html" ||
    mimeType === "application/xhtml+xml" ||
    mimeType === "" ||
    mimeType === "application/octet-stream"
  ) {
    // ── HTML path ─────────────────────────────────────────────────────────────
    const html = buffer.toString("utf8");
    const readable = extractReadableContent(html, finalUrl);

    title = readable.title;
    author = readable.byline ?? undefined;

    // Try to pick up published time from Readability or <meta> tags
    // (Readability exposes publishedTime via parse() but our wrapper doesn't
    //  return it; re-parse meta tags via a simple regex to avoid another JSDOM
    //  instance import).
    const metaPublished = html.match(
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i
    )?.[1];
    const metaDatetime = html.match(
      /<time[^>]+datetime=["']([^"']+)["']/i
    )?.[1];
    if (metaPublished) publishedAt = metaPublished;
    else if (metaDatetime) publishedAt = metaDatetime;

    markdown = htmlToMarkdown(readable.contentHtml);
    codeBlocks = extractCodeBlocks(markdown);
  } else {
    // ── Plain text / JSON / other ─────────────────────────────────────────────
    const text = buffer.toString("utf8");
    markdown = wrapIfCode(text, mimeType);
    codeBlocks = [];
  }

  const contentHash = sha256Hex(markdown);
  const metadata: Record<string, unknown> = { contentType, fetchedAt };

  log.info(
    { url: finalUrl, mimeType, textLength: markdown.length, codeBlocks: codeBlocks.length },
    "extractDocument complete"
  );

  return {
    url: finalUrl,
    title,
    markdown,
    textLength: markdown.length,
    codeBlocks,
    publishedAt,
    author,
    metadata,
    contentHash,
  };
}
