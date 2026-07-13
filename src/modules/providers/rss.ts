import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";
import { XMLParser } from "fast-xml-parser";

interface RSSItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  "dc:date"?: string;
  "content:encoded"?: string;
}

interface RSSChannel {
  item?: RSSItem | RSSItem[];
}

interface RSSFeed {
  rss?: { channel?: RSSChannel };
  feed?: { entry?: RSSItem | RSSItem[] };
}

const log = childLogger({ provider: "rss" });

const RSS_FEEDS = [
  "https://feeds.arstechnica.com/arstechnica/index",
  "https://www.phoronix.com/rss.php",
  "https://blog.rust-lang.org/feed.xml",
  "https://github.blog/feed/",
  "https://news.ycombinator.com/rss",
  "https://feeds.feedburner.com/TechCrunch",
  "https://www.theregister.com/headlines.rss",
  "https://lwn.net/headlines/newrss",
  "https://thehackernews.com/feed",
  "https://www.schneier.com/feed/atom/",
  "https://blog.cloudflare.com/feed/",
  "https://developers.googleblog.com/feeds/posts/default",
  "https://openai.com/blog/feed.xml",
  "https://aws.amazon.com/blogs/aws/feed/",
  "https://netflixtechblog.com/feed",
  "https://engineering.fb.com/feed/",
  "https://stackoverflow.blog/feed/",
  "https://blog.trailofbits.com/feed/",
  "https://research.google/blog/feed/",
  "https://www.bleepingcomputer.com/feed/",
];

const parser = new XMLParser({ ignoreAttributes: false });

export class RSSFeedProvider implements SearchProvider {
  id = "rss";
  displayName = "RSS Feed Aggregator";
  priority = 3;

  private lastFetch = 0;
  private cachedItems: SearchResult[] = [];
  private cacheDurationMs = 300_000; // 5 min cache

  capabilities(): ProviderCapabilities {
    return { category: "news", requiresApiKey: false, rateLimitPerMinute: 10 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 15);

    const items = await this.getCachedItems();

    const lowerQ = q.toLowerCase();
    const words = lowerQ.split(/\s+/).filter((w) => w.length > 2);

    const scored = items
      .map((item) => {
        const text = `${item.title} ${item.snippet ?? ""}`.toLowerCase();
        let score = 0;
        for (const w of words) {
          if (text.includes(w)) score++;
        }
        return { item, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.item);
  }

  private async getCachedItems(): Promise<SearchResult[]> {
    const now = Date.now();
    if (now - this.lastFetch < this.cacheDurationMs && this.cachedItems.length > 0) {
      return this.cachedItems;
    }

    const allItems: SearchResult[] = [];
    const feedPromises = RSS_FEEDS.slice(0, 8).map((feedUrl) => this.fetchFeed(feedUrl));

    const results = await Promise.allSettled(feedPromises);
    for (const result of results) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
    }

    this.cachedItems = allItems;
    this.lastFetch = now;
    log.info({ feeds: RSS_FEEDS.length, items: allItems.length }, "RSS feeds refreshed");
    return allItems;
  }

  private async fetchFeed(feedUrl: string): Promise<SearchResult[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(feedUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Verix-Search/1.0" },
      });
      clearTimeout(timer);

      if (!res.ok) return [];

      const xml = await res.text();
      const parsed = parser.parse(xml) as RSSFeed;

      const items: RSSItem[] = [];
      if (parsed.rss?.channel?.item) {
        items.push(...(Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item]));
      }
      if (parsed.feed?.entry) {
        items.push(...(Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry]));
      }

      return items.map((item) => ({
        id: `rss-${Buffer.from(item.link ?? item.title ?? "").toString("base64").slice(0, 24)}`,
        url: item.link ?? "",
        title: item.title ?? "Untitled",
        snippet: (item.description ?? item["content:encoded"] ?? "").replace(/<[^>]*>/g, "").slice(0, 500),
        provider: this.id,
        publishedAt: item.pubDate ?? item["dc:date"],
      })).filter((r) => r.url);
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const feedUrl = RSS_FEEDS[0] ?? "https://feeds.arstechnica.com/arstechnica/index";
      const res = await fetch(feedUrl, { signal: controller.signal, headers: { "User-Agent": "Verix-Search/1.0" } });
      clearTimeout(timer);
      return res.ok;
    } catch { return false; }
  }
}
