import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface SEItem {
  question_id: number;
  link: string;
  title: string;
  body?: string;
  creation_date: number;
  owner?: { display_name?: string };
}

interface SEResponse {
  items: SEItem[];
}

const log = childLogger({ provider: "stackexchange" });

export class StackExchangeProvider implements SearchProvider {
  id = "stackexchange";
  displayName = "Stack Overflow";
  priority = 7;

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
      const url =
        `https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow` +
        `&q=${encodeURIComponent(q)}&pagesize=${limit}&order=desc&sort=relevance&filter=withbody`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "StackExchange non-2xx response");
        return [];
      }

      const data = (await res.json()) as SEResponse;
      return data.items.map((item) => ({
        id: `stackexchange-${item.question_id}`,
        url: item.link,
        title: item.title,
        snippet: item.body ? item.body.replace(/<[^>]+>/g, "").slice(0, 300) : undefined,
        provider: this.id,
        publishedAt: new Date(item.creation_date * 1000).toISOString(),
        author: item.owner?.display_name,
        raw: item as unknown as Record<string, unknown>,
      }));
    } catch (err) {
      log.warn({ err }, "StackExchange search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.stackexchange.com/2.3/info?site=stackoverflow", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
