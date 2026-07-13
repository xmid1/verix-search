import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface CDXRecord {
  url: string;
  filename: string;
  offset: string;
  length: string;
  status: string;
  timestamp: string;
}

const log = childLogger({ provider: "commoncrawl" });

const CC_INDEXES = [
  "CC-MAIN-2025-51",
  "CC-MAIN-2025-39",
  "CC-MAIN-2025-26",
  "CC-MAIN-2025-13",
  "CC-MAIN-2024-51",
];

export class CommonCrawlProvider implements SearchProvider {
  id = "commoncrawl";
  displayName = "Common Crawl";
  priority = 3;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: false, rateLimitPerMinute: 30 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 10);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
      if (words.length === 0) return [];

      const index = CC_INDEXES[0];
      const url = `http://index.commoncrawl.org/${index}-index?url=*.${words[0]}.*&output=json&limit=${limit * 2}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status }, "Common Crawl non-2xx response");
        return [];
      }

      const text = await res.text();
      const lines = text.trim().split("\n").filter((l) => l.length > 0);
      const records: CDXRecord[] = lines.map((l) => JSON.parse(l));

      const results: SearchResult[] = [];
      const seen = new Set<string>();
      for (const rec of records) {
        if (seen.has(rec.url)) continue;
        seen.add(rec.url);
        const domain = new URL(rec.url).hostname;
        results.push({
          id: `cc-${Buffer.from(rec.url).toString("base64").slice(0, 24)}`,
          url: rec.url,
          title: domain,
          snippet: `Archived: ${rec.timestamp.slice(0, 8)} — ${rec.url}`,
          provider: this.id,
          publishedAt: `${rec.timestamp.slice(0, 4)}-${rec.timestamp.slice(4, 6)}-${rec.timestamp.slice(6, 8)}`,
        });
        if (results.length >= limit) break;
      }

      return results;
    } catch (err) {
      log.warn({ err }, "Common Crawl search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://index.commoncrawl.org/${CC_INDEXES[0]}-index?url=example.com&output=json&limit=1`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }
}
