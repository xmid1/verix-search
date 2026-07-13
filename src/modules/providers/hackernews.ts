import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface HNHit {
  objectID: string;
  url?: string;
  story_url?: string;
  title?: string;
  story_title?: string;
  comment_text?: string;
  story_text?: string;
  created_at: string;
  author: string;
}

interface HNResponse {
  hits: HNHit[];
}

const log = childLogger({ provider: "hackernews" });

export class HackerNewsProvider implements SearchProvider {
  id = "hackernews";
  displayName = "Hacker News";
  priority = 5;

  capabilities(): ProviderCapabilities {
    return { category: "community", requiresApiKey: false, rateLimitPerMinute: 60 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=${limit}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "HackerNews non-2xx response");
        return [];
      }

      const data = (await res.json()) as HNResponse;
      return data.hits.map((hit) => {
        const resultUrl =
          hit.url ?? hit.story_url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const title = hit.title ?? hit.story_title ?? "Hacker News Post";
        const snippet = hit.story_text ?? hit.comment_text ?? undefined;
        return {
          id: `hackernews-${hit.objectID}`,
          url: resultUrl,
          title,
          snippet,
          provider: this.id,
          publishedAt: hit.created_at,
          author: hit.author,
          raw: hit as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "HackerNews search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://hn.algolia.com/api/v1/search?query=test&hitsPerPage=1", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
