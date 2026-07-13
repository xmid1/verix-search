import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface NpmPackage {
  name: string;
  version: string;
  description?: string;
  links?: { npm?: string; homepage?: string };
  publisher?: { username?: string };
  date?: string;
}

interface NpmObject {
  package: NpmPackage;
}

interface NpmResponse {
  objects: NpmObject[];
}

const log = childLogger({ provider: "npm" });

export class NpmProvider implements SearchProvider {
  id = "npm";
  displayName = "npm Registry";
  priority = 8;

  capabilities(): ProviderCapabilities {
    return { category: "package", requiresApiKey: false, rateLimitPerMinute: 60 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=${limit}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "npm non-2xx response");
        return [];
      }

      const data = (await res.json()) as NpmResponse;
      return data.objects.map((obj) => {
        const pkg = obj.package;
        const pkgUrl = pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`;
        return {
          id: `npm-${pkg.name}@${pkg.version}`,
          url: pkgUrl,
          title: pkg.name,
          snippet: pkg.description,
          provider: this.id,
          publishedAt: pkg.date,
          author: pkg.publisher?.username,
          raw: pkg as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "npm search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://registry.npmjs.org/-/v1/search?text=react&size=1", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
