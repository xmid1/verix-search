import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface YouTubeVideoRenderer {
  videoId: string;
  title: { runs: { text: string }[] };
  descriptionSnippet?: { runs: { text: string }[] };
  publishedTimeText?: { simpleText: string };
  channelTitle?: string;
  lengthText?: { simpleText: string };
  viewCountText?: { simpleText: string };
}

interface YouTubeItem {
  videoRenderer?: YouTubeVideoRenderer;
}

interface YouTubeSectionList {
  contents: { itemSectionRenderer: { contents: YouTubeItem[] } }[];
}

interface YouTubePrimaryContents {
  sectionListRenderer: YouTubeSectionList;
}

interface YouTubeTwoColumnResults {
  primaryContents: YouTubePrimaryContents;
}

interface YouTubeContents {
  twoColumnSearchResultsRenderer: YouTubeTwoColumnResults;
}

interface YouTubeInitialData {
  contents?: YouTubeContents;
}

interface YouTubeContinuationContent {
  itemSectionRenderer?: { contents: YouTubeItem[] };
}

interface YouTubeContinuationContents {
  twoColumnSearchResultsRenderer?: {
    primaryContents?: YouTubePrimaryContents | YouTubeContinuationContent;
  };
}

const log = childLogger({ provider: "youtube" });

function extractVideoItems(data: YouTubeInitialData | YouTubeContinuationContents): YouTubeItem[] {
  const twoCol = (data as YouTubeInitialData)?.contents?.twoColumnSearchResultsRenderer
    ?? (data as YouTubeContinuationContents)?.twoColumnSearchResultsRenderer;
  if (!twoCol) return [];

  const primary = twoCol.primaryContents;
  if (!primary) return [];

  // Standard layout: sectionListRenderer > contents[0] > itemSectionRenderer > contents
  const sectionList = (primary as YouTubePrimaryContents).sectionListRenderer;
  if (sectionList?.contents?.[0]?.itemSectionRenderer?.contents) {
    return sectionList.contents[0].itemSectionRenderer.contents;
  }

  // Alternative layout: direct itemSectionRenderer
  const direct = primary as YouTubeContinuationContent;
  if (direct.itemSectionRenderer?.contents) {
    return direct.itemSectionRenderer.contents;
  }

  return [];
}

export class YouTubeProvider implements SearchProvider {
  id = "youtube";
  displayName = "YouTube";
  priority = 6;

  capabilities(): ProviderCapabilities {
    return { category: "general", requiresApiKey: false, rateLimitPerMinute: 30 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        log.warn({ status: res.status, url }, "YouTube non-2xx response");
        return [];
      }

      const html = await res.text();
      const match = html.match(/var ytInitialData\s*=\s*({.+?});/);
      if (!match?.[1]) {
        log.warn("YouTube: could not find ytInitialData in page");
        return [];
      }

      const rawData = JSON.parse(match[1]);
      const items = extractVideoItems(rawData);

      if (items.length === 0) {
        log.warn("YouTube: no video items found in response");
        return [];
      }

      return items
        .filter((item): item is { videoRenderer: YouTubeVideoRenderer } => !!item.videoRenderer)
        .slice(0, limit)
        .map((item) => {
          const v = item.videoRenderer;
          const snippet = v.descriptionSnippet?.runs?.map((r) => r.text).join("") ?? undefined;
          const publishedAt = v.publishedTimeText?.simpleText ?? undefined;
          const channelTitle = v.channelTitle ?? undefined;
          const duration = v.lengthText?.simpleText ?? undefined;
          const views = v.viewCountText?.simpleText ?? undefined;
          const extra = [duration, views].filter(Boolean).join(" · ");
          return {
            id: `youtube-${v.videoId}`,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            title: v.title.runs?.map((r) => r.text).join("") ?? "YouTube Video",
            snippet: snippet ? `[${channelTitle}] [${extra}] ${snippet}` : `[${channelTitle}] [${extra}]`,
            provider: this.id,
            publishedAt,
            author: channelTitle,
            raw: v as unknown as Record<string, unknown>,
          };
        });
    } catch (err) {
      log.warn({ err }, "YouTube search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("https://www.youtube.com/results?search_query=test&hl=en", {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
