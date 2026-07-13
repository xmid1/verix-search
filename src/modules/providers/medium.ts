import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface MediumPost {
  id: string;
  title: string;
  uniqueSlug?: string;
  content?: { subtitle?: string };
  firstPublishedAt?: number;
  creator?: { name?: string };
  virtuals?: {
    totalClapCount?: number;
    responsesCount?: number;
  };
}

interface MediumProps {
  pageProps?: { results?: MediumPost[] };
}

interface MediumNextData {
  props?: MediumProps;
}

const log = childLogger({ provider: "medium" });

export class MediumProvider implements SearchProvider {
  id = "medium";
  displayName = "Medium";
  priority = 5;

  capabilities(): ProviderCapabilities {
    return { category: "community", requiresApiKey: false, rateLimitPerMinute: 20 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://medium.com/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "Medium non-2xx response");
        return [];
      }

      const html = await res.text();

      let results: MediumPost[] = [];

      // Try __NEXT_DATA__ first
      const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>({.+?})<\/script>/);
      if (nextMatch?.[1]) {
        try {
          const nextData = JSON.parse(nextMatch[1]) as MediumNextData;
          const pageResults = nextData?.props?.pageProps?.results;
          if (pageResults && Array.isArray(pageResults)) {
            results = pageResults;
          }
        } catch {
          log.warn("Medium: failed to parse __NEXT_DATA__");
        }
      }

      // Fallback: try __INITIAL_STATE__
      if (results.length === 0) {
        const initMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/);
        if (initMatch?.[1]) {
          try {
            const initData = JSON.parse(initMatch[1]);
            const searchResult = initData?.searchResult;
            if (searchResult && Array.isArray(searchResult)) {
              results = searchResult;
            }
          } catch {
            log.warn("Medium: failed to parse __INITIAL_STATE__");
          }
        }
      }

      if (results.length === 0) {
        log.warn("Medium: could not find search results in page");
        return [];
      }

      return results.slice(0, limit).map((post) => {
        const slug = post.uniqueSlug ?? post.id;
        const publishedAt = post.firstPublishedAt
          ? new Date(post.firstPublishedAt).toISOString()
          : undefined;
        const author = post.creator?.name ?? undefined;
        const claps = post.virtuals?.totalClapCount ?? 0;
        const responses = post.virtuals?.responsesCount ?? 0;
        const suffix = `[💬${responses} 👏${claps}]`;
        return {
          id: `medium-${post.id}`,
          url: `https://medium.com/${post.creator?.name ? `@${post.creator.name}/` : "p/"}${slug}`,
          title: post.title,
          snippet: post.content?.subtitle
            ? `${post.content.subtitle} ${suffix}`
            : suffix,
          provider: this.id,
          publishedAt,
          author,
          raw: post as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "Medium search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("https://medium.com/search?q=test", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
