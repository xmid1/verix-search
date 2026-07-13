import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface DDGTopic {
  Text?: string;
  FirstURL?: string;
  Result?: string;
  Topics?: DDGTopic[];
}

interface DDGResponse {
  RelatedTopics?: DDGTopic[];
  AbstractText?: string;
  AbstractURL?: string;
}

const log = childLogger({ provider: "duckduckgo" });

function flattenTopics(topics: DDGTopic[]): DDGTopic[] {
  const out: DDGTopic[] = [];
  for (const t of topics) {
    if (t.Topics) {
      out.push(...flattenTopics(t.Topics));
    } else {
      out.push(t);
    }
  }
  return out;
}

export class DuckDuckGoProvider implements SearchProvider {
  id = "duckduckgo";
  displayName = "DuckDuckGo";
  priority = 7;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: false, rateLimitPerMinute: 60 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "DuckDuckGo non-2xx response");
        return [];
      }

      const data = (await res.json()) as DDGResponse;
      const topics = flattenTopics(data.RelatedTopics ?? []);

      return topics.slice(0, limit).map((topic, i) => ({
        id: `duckduckgo-${i}`,
        url: topic.FirstURL ?? "",
        title: topic.Text?.split(" - ")[0] ?? topic.Text ?? "DuckDuckGo Result",
        snippet: topic.Text ?? undefined,
        provider: this.id,
        publishedAt: data.AbstractText ? undefined : undefined,
        raw: topic as unknown as Record<string, unknown>,
      }));
    } catch (err) {
      log.warn({ err }, "DuckDuckGo search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.duckduckgo.com/?q=test&format=json&no_html=1&skip_disambig=1", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
