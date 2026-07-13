import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";
import * as cheerio from "cheerio";

const log = childLogger({ provider: "pypi" });

interface PyPiJsonResult {
  name: string;
  version: string;
  summary: string;
  package_url: string;
}

export class PypiProvider implements SearchProvider {
  id = "pypi";
  displayName = "PyPI";
  priority = 8;

  capabilities(): ProviderCapabilities {
    return { category: "package", requiresApiKey: false, rateLimitPerMinute: 30 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const results = await this.searchHtml(q, limit, controller.signal);
      if (results.length > 0) return results;
      return await this.searchJson(q, limit, controller.signal);
    } catch (err) {
      log.warn({ err }, "PyPI search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchHtml(q: string, limit: number, signal: AbortSignal): Promise<SearchResult[]> {
    const url = `https://pypi.org/search/?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      signal,
      headers: { "User-Agent": "Verix-Search/1.0", Accept: "text/html" },
    });

    if (!res.ok) {
      log.warn({ status: res.status, url }, "PyPI HTML search non-2xx response");
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const selectors = ["a.package-snippet", "a[href^='/project/']", ".package-list a"];

    for (const selector of selectors) {
      const items = $(selector).slice(0, limit);
      if (items.length === 0) continue;

      items.each((_i, el) => {
        const href = $(el).attr("href") ?? "";
        const name =
          $(el).find("span.package-snippet__name").text().trim() ||
          $(el).find(".package-name").text().trim() ||
          $(el).text().trim().split(/\s+/)[0] ||
          "";
        const version =
          $(el).find("span.package-snippet__version").text().trim() ||
          $(el).find(".package-version").text().trim() ||
          "";
        const summary =
          $(el).find("p.package-snippet__description").text().trim() ||
          $(el).find(".package-description").text().trim() ||
          "";

        if (!name) return;
        const pkgUrl = href.startsWith("http") ? href : `https://pypi.org${href}`;
        results.push({
          id: `pypi-${name}-${version || "latest"}`,
          url: pkgUrl,
          title: version ? `${name} ${version}` : name,
          snippet: summary || undefined,
          provider: this.id,
          raw: { name, version, summary, href } as Record<string, unknown>,
        });
      });

      if (results.length > 0) return results;
    }

    return results;
  }

  private async searchJson(q: string, limit: number, signal: AbortSignal): Promise<SearchResult[]> {
    const url = `https://pypi.org/search/?q=${encodeURIComponent(q)}&format=json`;
    const res = await fetch(url, {
      signal,
      headers: { "User-Agent": "Verix-Search/1.0", Accept: "application/json" },
    });

    if (!res.ok) return [];

    try {
      const body = await res.json() as { results?: PyPiJsonResult[] };
      if (!body.results || !Array.isArray(body.results)) return [];

      return body.results.slice(0, limit).map((item) => ({
        id: `pypi-${item.name}-${item.version}`,
        url: item.package_url || `https://pypi.org/project/${item.name}/`,
        title: item.version ? `${item.name} ${item.version}` : item.name,
        snippet: item.summary || undefined,
        provider: this.id,
        raw: item as unknown as Record<string, unknown>,
      }));
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://pypi.org", { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
