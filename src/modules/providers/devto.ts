import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface DevToArticle {
  id: number;
  title: string;
  url: string;
  description: string;
  published_at: string;
  user: { name: string };
  tags: string[];
  public_reactions_count: number;
  comments_count: number;
}

const log = childLogger({ provider: "devto" });

export class DevToProvider implements SearchProvider {
  id = "devto";
  displayName = "Dev.to";
  priority = 6;

  capabilities(): ProviderCapabilities {
    return { category: "community", requiresApiKey: false, rateLimitPerMinute: 30 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://dev.to/api/articles?q=${encodeURIComponent(q)}&per_page=${limit}&page=1`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "Dev.to non-2xx response");
        return [];
      }

      const data = (await res.json()) as DevToArticle[];
      return data.map((article) => ({
        id: `devto-${article.id}`,
        url: article.url,
        title: article.title,
        snippet: article.description || undefined,
        provider: this.id,
        publishedAt: article.published_at,
        author: article.user?.name ?? undefined,
        raw: article as unknown as Record<string, unknown>,
      }));
    } catch (err) {
      log.warn({ err }, "Dev.to search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("https://dev.to/api/articles?q=test&per_page=1&page=1", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
