import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface WikiSearchItem {
  pageid: number;
  title: string;
  snippet: string;
  timestamp: string;
}

interface WikiResponse {
  query: { search: WikiSearchItem[] };
}

const log = childLogger({ provider: "wikipedia" });

export class WikipediaProvider implements SearchProvider {
  id = "wikipedia";
  displayName = "Wikipedia";
  priority = 7;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: false, rateLimitPerMinute: 60 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url =
        `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*` +
        `&srsearch=${encodeURIComponent(q)}&srlimit=${limit}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        log.warn({ status: res.status, url }, "Wikipedia non-2xx response");
        return [];
      }

      const data = (await res.json()) as WikiResponse;
      return data.query.search.map((item) => ({
        id: `wikipedia-${item.pageid}`,
        url: `https://en.wikipedia.org/?curid=${item.pageid}`,
        title: item.title,
        snippet: item.snippet.replace(/<[^>]+>/g, ""),
        provider: this.id,
        publishedAt: item.timestamp,
        raw: item as unknown as Record<string, unknown>,
      }));
    } catch (err) {
      log.warn({ err }, "Wikipedia search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://en.wikipedia.org/w/api.php?action=query&format=json&meta=siteinfo", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
