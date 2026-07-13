import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface SemScholarPaper {
  paperId: string;
  title: string;
  url: string;
  publicationDate?: string;
  authors?: { name: string }[];
  abstract?: string;
  citationCount?: number;
  venue?: string;
}

interface SemScholarResponse {
  data?: SemScholarPaper[];
}

const log = childLogger({ provider: "semanticscholar" });

export class SemanticScholarProvider implements SearchProvider {
  id = "semanticscholar";
  displayName = "Semantic Scholar";
  priority = 8;

  capabilities(): ProviderCapabilities {
    return { category: "academic", requiresApiKey: false, rateLimitPerMinute: 10 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url =
        `https://api.semanticscholar.org/graph/v1/paper/search` +
        `?query=${encodeURIComponent(q)}&limit=${limit}&fields=title,url,publicationDate,authors,abstract,citationCount,venue`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "Semantic Scholar non-2xx response");
        return [];
      }

      const data = (await res.json()) as SemScholarResponse;
      if (!data.data) return [];

      return data.data.map((paper) => {
        const url = paper.url ?? `https://www.semanticscholar.org/paper/${paper.paperId}`;
        return {
          id: `s2-${paper.paperId}`,
          url,
          title: paper.title,
          snippet: paper.abstract?.slice(0, 300) ?? paper.venue ?? undefined,
          provider: this.id,
          publishedAt: paper.publicationDate,
          author: paper.authors?.[0]?.name,
          raw: paper as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "Semantic Scholar search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        "https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1&fields=title",
        { signal: controller.signal },
      );
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
