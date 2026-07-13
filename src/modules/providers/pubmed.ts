import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface ESearchResponse {
  esearchresult: { idlist: string[] };
}

type PubmedSummaryItem = {
  uid: string;
  title: string;
  source: string;
  pubdate?: string;
  authors?: { name: string }[];
  elocationid?: string;
  sortpubdate?: string;
  volume?: string;
  issue?: string;
  pages?: string;
};

interface ESummaryResponse {
  result: { uids: string[] } & Record<string, PubmedSummaryItem>;
}

const log = childLogger({ provider: "pubmed" });

export class PubMedProvider implements SearchProvider {
  id = "pubmed";
  displayName = "PubMed";
  priority = 8;

  capabilities(): ProviderCapabilities {
    return { category: "academic", requiresApiKey: false, rateLimitPerMinute: 180 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      // Step 1: Search for IDs
      const searchUrl =
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
        `?db=pubmed&term=${encodeURIComponent(q)}&retmax=${limit}&retmode=json`;
      const searchRes = await fetch(searchUrl, { signal: controller.signal });

      if (!searchRes.ok) {
        log.warn({ status: searchRes.status }, "PubMed esearch non-2xx response");
        return [];
      }

      const searchData = (await searchRes.json()) as ESearchResponse;
      const idList = searchData.esearchresult?.idlist;
      if (!idList || idList.length === 0) return [];

      // Step 2: Fetch details for those IDs
      const summaryUrl =
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi` +
        `?db=pubmed&id=${idList.join(",")}&retmode=json`;
      const summaryRes = await fetch(summaryUrl, { signal: controller.signal });

      if (!summaryRes.ok) {
        log.warn({ status: summaryRes.status }, "PubMed esummary non-2xx response");
        return [];
      }

      const summaryData = (await summaryRes.json()) as ESummaryResponse;
      const uids = summaryData.result?.uids ?? idList;

      const results: SearchResult[] = [];
      for (const uid of uids) {
        const item = summaryData.result?.[uid];
        if (!item) continue;

        const snippet = `[${item.source}] ${item.volume ?? ""}${item.issue ? "(" + item.issue + ")" : ""}${item.pages ? ":" + item.pages : ""}`.slice(0, 300);

        results.push({
          id: `pubmed-${uid}`,
          url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
          title: item.title,
          snippet: snippet || undefined,
          provider: this.id,
          publishedAt: item.pubdate,
          author: item.authors?.[0]?.name,
          raw: item as unknown as Record<string, unknown>,
        });
      }

      return results;
    } catch (err) {
      log.warn({ err }, "PubMed search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=test&retmax=1&retmode=json",
        { signal: controller.signal },
      );
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
