import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface CrossrefItem {
  DOI: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  created?: { "date-time"?: string };
  author?: Array<{ given?: string; family?: string }>;
}

interface CrossrefResponse {
  message: { items: CrossrefItem[] };
}

const log = childLogger({ provider: "crossref" });

export class CrossrefProvider implements SearchProvider {
  id = "crossref";
  displayName = "Crossref";
  priority = 9;

  capabilities(): ProviderCapabilities {
    return { category: "academic", requiresApiKey: false, rateLimitPerMinute: 50 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url =
        `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${limit}` +
        `&mailto=verix-search@example.com`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "Crossref non-2xx response");
        return [];
      }

      const data = (await res.json()) as CrossrefResponse;
      return data.message.items.map((item) => {
        const doi = item.DOI;
        const url = item.URL ?? `https://doi.org/${doi}`;
        const title = item.title?.[0] ?? doi;
        const snippet = item.abstract
          ? item.abstract.replace(/<[^>]+>/g, "").slice(0, 400)
          : undefined;
        const firstAuthor = item.author?.[0];
        const authorName =
          firstAuthor
            ? [firstAuthor.given, firstAuthor.family].filter(Boolean).join(" ")
            : undefined;
        return {
          id: `crossref-${doi.replace(/\//g, "-")}`,
          url,
          title,
          snippet,
          provider: this.id,
          publishedAt: item.created?.["date-time"],
          author: authorName || undefined,
          raw: item as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "Crossref search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.crossref.org/works?query=test&rows=1", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
