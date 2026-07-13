import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface CVEResult {
  id: string;
  summary: string;
  published_at: string;
  references: string[];
  cvss: number;
}

const log = childLogger({ provider: "cve" });

export class CVEProvider implements SearchProvider {
  id = "cve";
  displayName = "MITRE CVE";
  priority = 4;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: false, rateLimitPerMinute: 60 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 15);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://cve.circl.lu/api/search/${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "CVE API non-2xx response");
        return [];
      }

      const data = (await res.json()) as CVEResult[];
      if (!Array.isArray(data)) return [];

      return data.slice(0, limit).map((item) => ({
        id: `cve-${item.id}`,
        url: `https://nvd.nist.gov/vuln/detail/${item.id}`,
        title: item.id,
        snippet: item.summary,
        provider: this.id,
        publishedAt: item.published_at,
        raw: { cvss: item.cvss, references: item.references } as unknown as Record<string, unknown>,
      }));
    } catch (err) {
      log.warn({ err }, "CVE search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://cve.circl.lu/api/lookup?q=test", { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }
}
