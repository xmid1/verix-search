import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { childLogger } from "../../infra/logger.js";

const log = childLogger({ module: "extraction" });

export interface ReadableContent {
  title: string;
  contentHtml: string;
  byline?: string;
  excerpt?: string;
}

export function extractReadableContent(html: string, url: string): ReadableContent {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  const reader = new Readability(document);
  const article = reader.parse();

  if (article !== null) {
    return {
      title: article.title ?? "",
      contentHtml: article.content ?? "",
      byline: article.byline ?? undefined,
      excerpt: article.excerpt ?? undefined,
    };
  }

  // Fallback: Readability couldn't simplify — return raw body + title tag
  log.debug({ url }, "Readability returned null; falling back to raw body");
  const titleEl = document.querySelector("title");
  const title = titleEl?.textContent?.trim() ?? "";
  const bodyEl = document.querySelector("body");
  const contentHtml = bodyEl?.innerHTML ?? html;

  return { title, contentHtml };
}
