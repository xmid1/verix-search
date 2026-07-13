import type { Intent, SearchProvider } from "../../core/types.js";
import { allProviders, providersById } from "../providers/index.js";
import { env } from "../../config/env.js";

/**
 * Maps an intent to a preferred provider id order. Unknown ids are filtered
 * out silently so this table can be written aspirationally and grow as more
 * providers are added.
 */
const INTENT_PROVIDER_MAP: Record<Intent, string[]> = {
  programming: ["github", "stackexchange", "mdn", "devto", "medium"],
  package: ["npm", "pypi", "github", "brave"],
  github: ["github", "brave"],
  security: ["github", "stackexchange", "hackernews", "mdn"],
  debugging: ["stackexchange", "github", "hackernews", "medium"],
  api: ["mdn", "github", "stackexchange", "brave"],
  academic: ["semanticscholar", "pubmed", "arxiv", "crossref", "wikipedia"],
  news: ["googlenews", "hackernews", "twitter", "reddit", "brave", "medium", "wikipedia", "stackexchange"],
  documentation: ["mdn", "github", "wikipedia", "devto"],
  comparison: ["hackernews", "reddit", "stackexchange", "twitter", "wikipedia", "brave"],
  tutorial: ["mdn", "devto", "stackexchange", "github", "youtube", "medium"],
  reference: ["wikipedia", "mdn", "github", "brave", "duckduckgo"],
  architecture: ["github", "hackernews", "medium", "wikipedia"],
  research: ["semanticscholar", "pubmed", "arxiv", "crossref", "github", "hackernews", "brave"],
  general: ["brave", "duckduckgo", "wikipedia", "hackernews", "reddit", "stackexchange"],
};

/**
 * Platform keywords → provider IDs to inject when those keywords appear
 * in the raw query. This ensures explicit platform mentions are respected
 * regardless of intent detection.
 */
const KEYWORD_PROVIDER_MAP: Record<string, string[]> = {
  youtube: ["youtube"],
  video: ["youtube"],
  tutorial: ["youtube", "devto", "medium"],
  reddit: ["reddit"],
  github: ["github"],
  npm: ["npm"],
  pypi: ["pypi"],
  arxiv: ["arxiv"],
  paper: ["arxiv", "semanticscholar"],
  research: ["semanticscholar", "pubmed", "arxiv"],
};

/**
 * Extract platform-specific provider IDs from the raw query text.
 * e.g. query containing "youtube" → inject ["youtube"] provider.
 */
function keywordProviders(rawQuery: string): string[] {
  const lower = rawQuery.toLowerCase();
  const matched: string[] = [];
  for (const [keyword, providers] of Object.entries(KEYWORD_PROVIDER_MAP)) {
    if (lower.includes(keyword)) {
      for (const p of providers) {
        if (!matched.includes(p)) matched.push(p);
      }
    }
  }
  return matched;
}

export function selectProviders(intent: Intent, rawQuery?: string): SearchProvider[] {
  const preferred = INTENT_PROVIDER_MAP[intent] ?? INTENT_PROVIDER_MAP.general;
  const selected = preferred.map((id) => providersById[id]).filter((p): p is SearchProvider => Boolean(p));

  // Inject keyword-matched providers (e.g. "youtube" in query → YouTube provider)
  if (rawQuery) {
    const keywordIds = keywordProviders(rawQuery);
    for (const id of keywordIds) {
      const provider = providersById[id];
      if (provider && !selected.includes(provider)) {
        // Insert keyword-matched providers at front (high priority)
        selected.unshift(provider);
      }
    }
  }

  // Backfill with remaining providers (by priority) if the intent map didn't
  // reach the configured fan-out
  if (selected.length < env.MAX_PROVIDERS_PER_QUERY) {
    const remaining = allProviders
      .filter((p) => !selected.includes(p))
      .sort((a, b) => b.priority - a.priority);
    for (const p of remaining) {
      if (selected.length >= env.MAX_PROVIDERS_PER_QUERY) break;
      selected.push(p);
    }
  }

  return selected.slice(0, env.MAX_PROVIDERS_PER_QUERY);
}
