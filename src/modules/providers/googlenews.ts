import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface GNewsArticle {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  source_id?: string;
  source_icon?: string;
  content?: string;
  creator?: string[];
  image_url?: string;
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

const log = childLogger({ provider: "googlenews" });

export class GoogleNewsProvider implements SearchProvider {
  id = "googlenews";
  displayName = "Google News";
  priority = 7;

  capabilities(): ProviderCapabilities {
    return { category: "news", requiresApiKey: true, rateLimitPerMinute: 10 };
  }

  private async searchGNewsApi(q: string, limit: number): Promise<SearchResult[]> {
    const apiKey = env.GOOGLE_API_KEY;
    if (!apiKey) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=${Math.min(limit, 10)}&apikey=${apiKey}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status }, "GNews API error");
        return [];
      }

      const data = (await res.json()) as GNewsResponse;
      return (data.articles ?? []).slice(0, limit).map((article, i) => ({
        id: `gnews-${i}-${article.link}`,
        url: article.link,
        title: article.title,
        snippet: (article.description || article.content || "").slice(0, 300),
        provider: this.id,
        publishedAt: article.pubDate,
        author: article.creator?.[0] ?? article.source_id ?? undefined,
        raw: article as unknown as Record<string, unknown>,
      }));
    } catch (err) {
      log.warn({ err }, "GNews API search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchGoogleNewsRSS(q: string, limit: number): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VerixSearch/1.0)" },
      });

      if (!res.ok) {
        log.warn({ status: res.status }, "Google News RSS error");
        return [];
      }

      const xml = await res.text();
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

      return items.slice(0, limit).map((itemXml, i) => {
        const extract = (tag: string) =>
          itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? "";
        const title = extract("title");
        const link = extract("link");
        const pubDate = extract("pubDate");
        const description = extract("description");
        const source = extract("source");

        // Google News wraps links in redirects; extract original URL
        const urlMatch = link.match(/url=([^&]+)/);
        const cleanLink = urlMatch?.[1]
          ? decodeURIComponent(urlMatch[1])
          : link;

        return {
          id: `gnews-rss-${i}`,
          url: cleanLink,
          title: title.replace(/&lt;!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim(),
          snippet: description.replace(/<[^>]+>/g, "").slice(0, 300),
          provider: this.id,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
          author: source || undefined,
          raw: { title, link: cleanLink, pubDate, source },
        };
      });
    } catch (err) {
      log.warn({ err }, "Google News RSS search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    if (env.GOOGLE_API_KEY) {
      return this.searchGNewsApi(q, limit);
    }
    return this.searchGoogleNewsRSS(q, limit);
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("https://news.google.com", {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
