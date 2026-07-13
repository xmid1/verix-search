import { type SearchProvider, type SearchQuery, type SearchResult, type ProviderCapabilities } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { env } from "../../config/env.js";

interface GithubRepo {
  id: number;
  html_url: string;
  full_name: string;
  description: string | null;
  pushed_at: string;
  owner: { login: string };
}

interface GithubIssue {
  id: number;
  html_url: string;
  title: string;
  body: string | null;
  updated_at: string;
  user: { login: string };
}

interface GithubRepoResponse {
  items: GithubRepo[];
}

interface GithubIssueResponse {
  items: GithubIssue[];
}

const log = childLogger({ provider: "github" });

/**
 * Known open-source projects mapped to their GitHub org/repo path.
 * When the query mentions these projects, the provider injects a direct
 * repository lookup alongside the text search.
 */
const KNOWN_PROJECT_REPOS: Record<string, string> = {
  "swe-agent": "princeton-nlp/SWE-agent",
  "swebench": "princeton-nlp/SWE-bench",
  "openhands": "All-Hands-AI/OpenHands",
  "opendevin": "All-Hands-AI/OpenHands",
  "autogpt": "Significant-Gravitas/AutoGPT",
  "langgraph": "langchain-ai/langgraph",
  "langchain": "langchain-ai/langchain",
  "crewai": "crewAIInc/crewAI",
  "autogen": "microsoft/autogen",
  "semantic kernel": "microsoft/semantic-kernel",
  "metagpt": "geekan/MetaGPT",
  "voyager": "MineDojo/Voyager",
  "memgpt": "cpacker/MemGPT",
  "letta": "letta-ai/letta",
  "codeact": "xingyaoww/code-act",
  "devika": "stitionai/devika",
  "chatdev": "OpenBMB/ChatDev",
  "toolllm": "OpenBMB/ToolLLM",
  "react": "reactjs/react.dev",
  "agentbench": "THUDM/AgentBench",
  "pytorch": "pytorch/pytorch",
  "tensorflow": "tensorflow/tensorflow",
  "fastapi": "fastapi/fastapi",
  "next.js": "vercel/next.js",
  "prisma": "prisma/prisma",
  "bun": "oven-sh/bun",
  "vite": "vitejs/vite",
  "deno": "denoland/deno",
  "tailwind": "tailwindlabs/tailwindcss",
};

export class GithubProvider implements SearchProvider {
  id = "github";
  displayName = "GitHub";
  priority = 8;

  capabilities(): ProviderCapabilities {
    return { category: "code", requiresApiKey: false, rateLimitPerMinute: 10 };
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = query.raw || query.expanded?.[0] || "";
    if (!q) return [];
    const limit = Math.min(query.limit ?? 8, 20);
    const lowerQ = q.toLowerCase();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.SEARCH_TIMEOUT_MS);

    try {
      // Check if any known project is mentioned — inject direct repo URL
      const directRepos: SearchResult[] = [];
      for (const [project, repo] of Object.entries(KNOWN_PROJECT_REPOS)) {
        if (lowerQ.includes(project)) {
          directRepos.push({
            id: `github-repo-${repo.replace(/\//g, "-")}`,
            url: `https://github.com/${repo}`,
            title: repo,
            snippet: `${repo} — GitHub repository`,
            provider: this.id,
            author: repo.split("/")[0],
          });
          if (directRepos.length >= 3) break;
        }
      }

      // Text-based repository search with name-focused query
      const searchQuery = directRepos.length > 0
        ? `${q} ${directRepos.map((r) => `repo:${r.title}`).join(" ")}`
        : q;
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=${limit}&sort=stars&order=desc`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Verix-Search", Accept: "application/vnd.github+json" },
      });

      const results: SearchResult[] = [...directRepos];

      if (res.status === 403) {
        log.warn({ url }, "GitHub rate limit hit");
        return results;
      }
      if (!res.ok) {
        log.warn({ status: res.status, url }, "GitHub non-2xx response");
        return results;
      }

      const data = (await res.json()) as GithubRepoResponse;

      // Merge direct repos with search results, avoiding duplicates
      const seenUrls = new Set(results.map((r) => r.url));
      for (const item of data.items) {
        if (seenUrls.has(item.html_url)) continue;
        seenUrls.add(item.html_url);
        results.push({
          id: `github-repo-${item.id}`,
          url: item.html_url,
          title: item.full_name,
          snippet: item.description ?? undefined,
          provider: this.id,
          publishedAt: item.pushed_at,
          author: item.owner.login,
          raw: item as unknown as Record<string, unknown>,
        });
        if (results.length >= limit) break;
      }

      return results;
    } catch (err) {
      log.warn({ err }, "GitHub search error");
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.github.com", {
        signal: controller.signal,
        headers: { "User-Agent": "Verix-Search" },
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
}
