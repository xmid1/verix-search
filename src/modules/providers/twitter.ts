import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface TweetResult {
  rest_id: string;
  core?: {
    user_results?: {
      result?: {
        legacy?: { screen_name: string; name: string };
      };
    };
  };
  legacy?: {
    full_text: string;
    created_at: string;
    favorite_count: number;
    retweet_count: number;
    reply_count: number;
    entities?: {
      urls?: { expanded_url: string; display_url: string }[];
    };
  };
}

interface TwitterSearchResponse {
  data?: { search_by_raw_query?: { search_timeline?: { timeline?: { instructions?: {
    entries?: { content?: { itemContent?: { tweet_results?: { result?: TweetResult } } } }[];
  }[] } } } };
}

const log = childLogger({ provider: "twitter" });

export class TwitterProvider implements SearchProvider {
  id = "twitter";
  displayName = "Twitter / X";
  priority = 5;

  capabilities(): ProviderCapabilities {
    return { category: "community", requiresApiKey: true, rateLimitPerMinute: 30 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];

    if (env.TWITTER_BEARER_TOKEN) {
      return this.searchOAuth2(q, query.limit ?? 8);
    }
    return this.searchScrape(q, query.limit ?? 8);
  }

  private async searchOAuth2(q: string, limit: number): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=${Math.min(limit, 10)}&tweet.fields=created_at,public_metrics,author_id&expansions=author_id&user.fields=username,name`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}` },
      });

      if (!res.ok) {
        log.warn({ status: res.status }, "Twitter API v2 error");
        return [];
      }

      const data = (await res.json()) as {
        data?: { id: string; text: string; created_at: string; public_metrics?: { like_count: number; retweet_count: number }; author_id?: string }[];
        includes?: { users?: { id: string; username: string; name: string }[] };
      };

      const users = new Map((data.includes?.users ?? []).map((u) => [u.id, u]));
      return (data.data ?? []).slice(0, limit).map((tweet) => {
        const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
        const metrics = tweet.public_metrics;
        const stats = metrics ? `❤️${metrics.like_count} 🔁${metrics.retweet_count}` : "";
        return {
          id: `twitter-${tweet.id}`,
          url: `https://x.com/${user?.username ?? "twitter"}/status/${tweet.id}`,
          title: `${user?.name ?? "Twitter User"}: ${tweet.text.slice(0, 80)}...`,
          snippet: `@${user?.username ?? "unknown"} [${stats}] ${tweet.text.slice(0, 280)}`,
          provider: this.id,
          publishedAt: tweet.created_at,
          author: user?.name ?? "Twitter User",
          raw: tweet as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "Twitter OAuth2 search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchScrape(q: string, limit: number): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const url = `https://twitter.com/search?q=${encodeURIComponent(q)}&src=typed_query&f=live`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/json",
        },
      });

      if (!res.ok) {
        log.warn({ status: res.status }, "Twitter scrape returned non-2xx");
        return [];
      }

      const html = await res.text();
      const matches = html.matchAll(/__INITIAL_STATE__\s*=\s*({.+?});/g);
      let tweets: TweetResult[] = [];

      for (const match of matches) {
        try {
          const group = match[1];
          if (!group) continue;
          const state = JSON.parse(group);
          const entries = state.entries?.entries ?? [];
          for (const entry of entries) {
            const tweet = entry?.content?.itemContent?.tweet_results?.result;
            if (tweet?.rest_id) tweets.push(tweet);
          }
        } catch {
          continue;
        }
      }

      tweets = tweets.slice(0, limit);

      return tweets.map((tweet) => {
        const user = tweet.core?.user_results?.result?.legacy;
        const text = tweet.legacy?.full_text ?? "";
        const created = tweet.legacy?.created_at ?? "";
        const metrics = tweet.legacy;
        const stats = metrics
          ? `❤️${metrics.favorite_count} 🔁${metrics.retweet_count} 💬${metrics.reply_count}`
          : "";
        const urls = tweet.legacy?.entities?.urls;
        const tweetUrl = urls?.[0]?.expanded_url
          ?? `https://x.com/${user?.screen_name ?? "twitter"}/status/${tweet.rest_id}`;

        return {
          id: `twitter-${tweet.rest_id}`,
          url: tweetUrl,
          title: `${user?.name ?? "Twitter User"}: ${text.slice(0, 80)}...`,
          snippet: `@${user?.screen_name ?? "unknown"} [${stats}] ${text.slice(0, 280)}`,
          provider: this.id,
          publishedAt: created ? new Date(created).toISOString() : undefined,
          author: user?.name ?? "Twitter User",
          raw: tweet as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "Twitter scrape search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    if (env.TWITTER_BEARER_TOKEN) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("https://api.twitter.com/2/tweets/search/recent?query=test&max_results=1", {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}` },
        });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("https://twitter.com", {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
