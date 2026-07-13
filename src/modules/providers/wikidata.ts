import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface WikidataBinding {
  item: { value: string };
  itemLabel: { value: string };
  itemDescription?: { value: string };
}

interface WikidataResponse {
  results: { bindings: WikidataBinding[] };
}

const log = childLogger({ provider: "wikidata" });

export class WikidataProvider implements SearchProvider {
  id = "wikidata";
  displayName = "Wikidata";
  priority = 4;

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
      const sparql = `
        SELECT ?item ?itemLabel ?itemDescription WHERE {
          ?item ?label "${q}"@en.
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        LIMIT ${limit}
      `.trim();

      const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Verix-Search/1.0", Accept: "application/sparql-results+json" },
      });

      if (!res.ok) {
        log.warn({ status: res.status }, "Wikidata SPARQL non-2xx response");
        return [];
      }

      const data = (await res.json()) as WikidataResponse;
      const bindings = data?.results?.bindings;
      if (!Array.isArray(bindings)) return [];

      return bindings.map((b) => ({
        id: `wikidata-${b.item.value.split("/").pop()}`,
        url: b.item.value,
        title: b.itemLabel.value,
        snippet: b.itemDescription?.value ?? "Wikidata entity",
        provider: this.id,
      }));
    } catch (err) {
      log.warn({ err }, "Wikidata search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://query.wikidata.org/sparql?format=json&query=SELECT%20*%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D%20LIMIT%201", {
        signal: controller.signal,
        headers: { "User-Agent": "Verix-Search/1.0" },
      });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }
}
