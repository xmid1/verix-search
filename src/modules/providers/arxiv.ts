import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";
import { XMLParser } from "fast-xml-parser";

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  author: { name: string } | Array<{ name: string }>;
  link: { "@_href": string; "@_rel": string } | Array<{ "@_href": string; "@_rel": string }>;
}

interface ArxivFeed {
  feed: { entry?: ArxivEntry | ArxivEntry[] };
}

const log = childLogger({ provider: "arxiv" });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export class ArxivProvider implements SearchProvider {
  id = "arxiv";
  displayName = "arXiv";
  priority = 9;

  capabilities(): ProviderCapabilities {
    return { category: "academic", requiresApiKey: false, rateLimitPerMinute: 20 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url =
        `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}` +
        `&start=0&max_results=${limit}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "arXiv non-2xx response");
        return [];
      }

      const xml = await res.text();
      const parsed = parser.parse(xml) as ArxivFeed;
      const rawEntries = parsed.feed?.entry;
      if (!rawEntries) return [];

      const entries: ArxivEntry[] = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

      return entries.map((entry) => {
        // Pick the alternate (HTML) link if available, else the first one
        const links = Array.isArray(entry.link) ? entry.link : [entry.link];
        const altLink = links.find((l) => l["@_rel"] === "alternate");
        const entryUrl = altLink?.["@_href"] ?? (typeof entry.id === "string" ? entry.id : "");

        // Normalize author
        const authorField = entry.author;
        const firstAuthor = Array.isArray(authorField)
          ? authorField[0]?.name
          : authorField?.name;

        return {
          id: `arxiv-${String(entry.id).split("/").pop() ?? entry.id}`,
          url: entryUrl,
          title: String(entry.title).replace(/\s+/g, " ").trim(),
          snippet: String(entry.summary).replace(/\s+/g, " ").trim().slice(0, 400),
          provider: this.id,
          publishedAt: entry.published,
          author: firstAuthor,
          raw: entry as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "arXiv search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("http://export.arxiv.org/api/query?search_query=all:test&max_results=1", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
