import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface GDELTArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

interface GDELTResponse {
  articles: GDELTArticle[];
}

const log = childLogger({ provider: "gdelt" });

export class GDELTProvider implements SearchProvider {
  id = "gdelt";
  displayName = "GDELT Project";
  priority = 4;

  capabilities(): ProviderCapabilities {
    return { category: "news", requiresApiKey: false, rateLimitPerMinute: 120 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=${limit}&format=json`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "GDELT non-2xx response");
        return [];
      }

      const data = (await res.json()) as GDELTResponse;
      if (!data.articles || !Array.isArray(data.articles)) return [];

      return data.articles.map((article) => ({
        id: `gdelt-${Buffer.from(article.url).toString("base64").slice(0, 32)}`,
        url: article.url,
        title: article.title,
        snippet: `[${article.domain}] ${article.title}`,
        provider: this.id,
        publishedAt: article.seendate,
      }));
    } catch (err) {
      log.warn({ err }, "GDELT search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=test&maxrecords=1&format=json", { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }
}
