import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface RedditChild {
  data: {
    id: string;
    url: string;
    title: string;
    selftext: string;
    created_utc: number;
    author: string;
    permalink: string;
    subreddit: string;
    score: number;
    num_comments: number;
  };
}

interface RedditResponse {
  data: { children: RedditChild[]; dist: number };
}

interface OAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

const log = childLogger({ provider: "reddit" });

export class RedditProvider implements SearchProvider {
  id = "reddit";
  displayName = "Reddit";
  priority = 5;

  private token: OAuthToken | null = null;
  private tokenExpiresAt = 0;

  capabilities(): ProviderCapabilities {
    return { category: "community", requiresApiKey: false, rateLimitPerMinute: 60 };
  }

  private async ensureToken(): Promise<string | null> {
    if (this.token && Date.now() < this.tokenExpiresAt - 60000) {
      return this.token.access_token;
    }

    const clientId = env.REDDIT_CLIENT_ID;
    const clientSecret = env.REDDIT_CLIENT_SECRET;

    if (clientId && clientSecret) {
      try {
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const res = await fetch("https://www.reddit.com/api/v1/access_token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "web:verix-search:1.0.0 (by /u/verix)",
          },
          body: "grant_type=client_credentials",
        });

        if (res.ok) {
          const data = (await res.json()) as OAuthToken;
          this.token = data;
          this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
          log.info("Reddit OAuth token acquired");
          return data.access_token;
        }
        log.warn({ status: res.status }, "Reddit OAuth failed, falling back to public API");
      } catch (err) {
        log.warn({ err }, "Reddit OAuth error, falling back to public API");
      }
    } else {
      log.info("No REDDIT_CLIENT_ID/SECRET set, using public API (may be blocked on cloud IPs)");
    }

    return null;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 25);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      const accessToken = await this.ensureToken();

      let url: string;
      let headers: Record<string, string>;

      if (accessToken) {
        url = `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&limit=${limit}&sort=relevance&raw_json=1&t=all`;
        headers = {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "web:verix-search:1.0.0 (by /u/verix)",
          Accept: "application/json",
        };
      } else {
        url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&limit=${limit}&sort=relevance&raw_json=1`;
        headers = {
          "User-Agent": "web:verix-search:1.0.0 (by /u/verix)",
          Accept: "application/json",
        };
      }

      const res = await fetch(url, { signal: controller.signal, headers });

      if (res.status === 429) {
        log.warn({ url, status: 429 }, "Reddit rate limited (429)");
        return [];
      }
      if (res.status === 403) {
        log.warn({ url, status: 403 }, "Reddit 403 — set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in env for OAuth access from cloud IPs");
        return [];
      }
      if (!res.ok) {
        log.warn({ status: res.status, url }, "Reddit non-2xx response");
        return [];
      }

      const data = (await res.json()) as RedditResponse;
      if (!data?.data?.children) {
        log.warn({ url }, "Reddit returned unexpected response shape");
        return [];
      }

      return data.data.children.map((child) => {
        const post = child.data;
        const postUrl = post.url.startsWith("http")
          ? post.url
          : `https://www.reddit.com${post.permalink}`;
        const subredditInfo = post.subreddit ? `r/${post.subreddit}` : "";
        const stats = `👍${post.score ?? "?"} 💬${post.num_comments ?? "?"}`;
        return {
          id: `reddit-${post.id}`,
          url: postUrl,
          title: post.title,
          snippet: post.selftext
            ? `[${subredditInfo}] [${stats}] ${post.selftext.slice(0, 280)}`
            : `[${subredditInfo}] [${stats}]`,
          provider: this.id,
          publishedAt: new Date(post.created_utc * 1000).toISOString(),
          author: `u/${post.author}`,
          raw: post as unknown as Record<string, unknown>,
        };
      });
    } catch (err) {
      log.warn({ err }, "Reddit search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const accessToken = await this.ensureToken();
      const url = accessToken
        ? "https://oauth.reddit.com/api/v1/me"
        : "https://www.reddit.com/search.json?q=test&limit=1&raw_json=1";
      const headers: Record<string, string> = {
        "User-Agent": "web:verix-search:1.0.0 (by /u/verix)",
        Accept: "application/json",
      };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timer);

      if (res.status === 429) return true;
      return res.ok;
    } catch {
      return false;
    }
  }
}
