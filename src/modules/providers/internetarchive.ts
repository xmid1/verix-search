import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface IAResult {
  identifier: string;
  title: string;
  description: string;
  date: string;
  mediatype: string;
}

interface IASearchResponse {
  response: {
    docs: IAResult[];
    numFound: number;
  };
}

const log = childLogger({ provider: "internetarchive" });

export class InternetArchiveProvider implements SearchProvider {
  id = "internetarchive";
  displayName = "Internet Archive";
  priority = 3;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: false, rateLimitPerMinute: 30 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 15);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://archive.org/services/search/v1/scoped?q=${encodeURIComponent(q)}&count=${limit}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status }, "Internet Archive non-2xx response");
        return [];
      }

      const data = (await res.json()) as IASearchResponse;
      const docs = data?.response?.docs;
      if (!Array.isArray(docs)) return [];

      return docs.map((doc) => ({
        id: `ia-${doc.identifier}`,
        url: `https://archive.org/details/${doc.identifier}`,
        title: doc.title || doc.identifier,
        snippet: doc.description ?? `Internet Archive — ${doc.mediatype}`,
        provider: this.id,
        publishedAt: doc.date,
      }));
    } catch (err) {
      log.warn({ err }, "Internet Archive search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://archive.org/services/search/v1/scoped?q=test&count=1", { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }
}
