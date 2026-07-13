import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface OSVVulnerability {
  id: string;
  summary: string;
  aliases: string[];
  published: string;
  references: { url: string }[];
  severity: { type: string; score: string }[];
}

const log = childLogger({ provider: "osv" });

export class OSVProvider implements SearchProvider {
  id = "osv";
  displayName = "OSV.dev";
  priority = 4;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: false, rateLimitPerMinute: 100 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const res = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        log.warn({ status: res.status }, "OSV API non-2xx response");
        return [];
      }

      const data = (await res.json()) as { vulns: OSVVulnerability[] } | { results: OSVVulnerability[] };
      const vulns = (data as { vulns: OSVVulnerability[] }).vulns || (data as { results: OSVVulnerability[] }).results || [];
      if (!Array.isArray(vulns)) return [];

      const limit = Math.min(query.limit ?? 8, 15);
      return vulns.slice(0, limit).map((v) => ({
        id: `osv-${v.id}`,
        url: `https://osv.dev/vulnerability/${v.id}`,
        title: v.id,
        snippet: v.summary || v.aliases?.[0] || "No description",
        provider: this.id,
        publishedAt: v.published,
      }));
    } catch (err) {
      log.warn({ err }, "OSV search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test" }),
      });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }
}
