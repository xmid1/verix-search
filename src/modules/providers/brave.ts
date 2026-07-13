import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  profile?: { name?: string };
  family_friendly?: boolean;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

const log = childLogger({ provider: "brave" });

export class BraveProvider implements SearchProvider {
  id = "brave";
  displayName = "Brave Search";
  priority = 9;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: true, rateLimitPerMinute: 15 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    if (!env.BRAVE_API_KEY) {
      log.warn("BRAVE_API_KEY not configured");
      return [];
    }
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${limit}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "X-Subscription-Token": env.BRAVE_API_KEY, Accept: "application/json" },
      });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "Brave non-2xx response");
        return [];
      }

      const data = (await res.json()) as BraveResponse;
      return (data.web?.results ?? []).map((r) => ({
        id: `brave-${r.url}`,
        url: r.url,
        title: r.title,
        snippet: r.description || undefined,
        provider: this.id,
        publishedAt: r.age ?? undefined,
        author: r.profile?.name ?? undefined,
        raw: r as unknown as Record<string, unknown>,
      }));
    } catch (err) {
      log.warn({ err }, "Brave search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    if (!env.BRAVE_API_KEY) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", {
        signal: controller.signal,
        headers: { "X-Subscription-Token": env.BRAVE_API_KEY, Accept: "application/json" },
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
