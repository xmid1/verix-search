import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface MdnDocument {
  mdn_url: string;
  title: string;
  summary?: string;
  locale: string;
}

interface MdnHit {
  mdn_url: string;
  title: string;
  summary?: string;
  locale: string;
}

interface MdnResponse {
  documents?: MdnDocument[];
  hits?: MdnHit[];
}

const log = childLogger({ provider: "mdn" });

export class MdnProvider implements SearchProvider {
  id = "mdn";
  displayName = "MDN Web Docs";
  priority = 9;

  capabilities(): ProviderCapabilities {
    return { category: "docs", requiresApiKey: false, rateLimitPerMinute: 60 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(q)}&locale=en-US&size=${limit}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "MDN non-2xx response");
        return [];
      }

      const data = (await res.json()) as MdnResponse;
      // MDN API returns either documents or hits depending on version
      const items = data.documents ?? data.hits ?? [];

      return items.map((item) => {
        const mdnUrl = item.mdn_url.startsWith("http")
          ? item.mdn_url
          : `https://developer.mozilla.org${item.mdn_url}`;
        // Stable ID: strip the /en-US prefix and slugify
        const slug = item.mdn_url.replace(/^\/en-US\/docs\//, "").replace(/\//g, "-");
        return {
          id: `mdn-${slug}`,
          url: mdnUrl,
          title: item.title,
          snippet: item.summary,
          provider: this.id,
          raw: item as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "MDN search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://developer.mozilla.org/api/v1/search?q=javascript&locale=en-US&size=1", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
