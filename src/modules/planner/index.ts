import { nanoid } from "nanoid";
import type { NewsCategory, SearchProvider, SearchQuery } from "../../core/types.js";
import { detectLanguage } from "./language.js";
import { detectIntent } from "./intent.js";
import { expandQuery } from "./expansion.js";
import { selectProviders } from "./providerSelection.js";
import { classifyNews } from "./newsClassifier.js";
import { expandEntities } from "./entityExpander.js";
import { providersById } from "../providers/index.js";
import { domainsForTechnology } from "../providers/domainAffinity.js";
import { childLogger } from "../../infra/logger.js";

const logger = childLogger({ module: "planner" });

export interface SearchPlan {
  query: SearchQuery;
  providers: SearchProvider[];
}

// Kept local (rather than importing a list from the providers module) so the
// planner doesn't take on a hard dependency on how domainAffinity enumerates
// its keys — this list only needs to be "good enough" to catch common cases.
const KNOWN_TECHNOLOGIES = [
  "react", "next.js", "nextjs", "node.js", "nodejs", "typescript", "javascript", "python",
  "fastify", "express", "django", "flask", "docker", "kubernetes", "rust", "go", "vue",
  "angular", "svelte", "graphql", "postgresql", "postgres", "redis", "mongodb", "prisma",
  "tailwind", "webpack", "vite", "deno", "bun", "rust", "cpp", "java", "kotlin", "swift",
  "ruby", "rails", "php", "laravel", "symfony", "csharp", "dotnet", "aspnet",
  "terraform", "ansible", "helm", "prometheus", "grafana", "kafka", "rabbitmq",
  "tensorflow", "pytorch", "keras", "scikit", "pandas", "numpy", "jupyter",
  "react native", "flutter", "swiftui", "jetpack compose", "android", "ios",
  "aws", "gcp", "azure", "cloudflare", "vercel", "netlify", "supabase", "firebase",
  "linux", "bash", "zsh", "fish", "git", "github actions", "ci/cd", "jenkins",
  "nginx", "apache", "caddy", "traefik", "envoy", "istio",
];

function extractDomainHints(rawQuery: string): string[] {
  const lower = rawQuery.toLowerCase();
  const hints: string[] = [];
  for (const tech of KNOWN_TECHNOLOGIES) {
    if (lower.includes(tech)) {
      hints.push(...domainsForTechnology(tech));
    }
  }
  return Array.from(new Set(hints));
}

/**
 * The Query Planner (spec §9-15): turns one raw question into a full search
 * plan — language, intent, domain affinity, expanded query variants, and a
 * ranked provider shortlist — before a single HTTP call is made.
 */
export async function buildSearchPlan(rawQuery: string, opts: { limit?: number } = {}): Promise<SearchPlan> {
  const traceId = nanoid();
  const language = detectLanguage(rawQuery);
  const { intent, source: intentSource } = await detectIntent(rawQuery);

  let newsCategory: NewsCategory | undefined;
  let newsKeywords: string[] | undefined;
  if (intent === "news") {
    const classification = classifyNews(rawQuery);
    newsCategory = classification.category;
    newsKeywords = classification.keywords;
    logger.info({ newsCategory, newsKeywords }, "news topic classified");
  }

  // Entity expansion: for domain-specific queries (AI agents, CTF, etc.),
  // inject relevant entities into the query payload.
  const entityExpansion = expandEntities(rawQuery);
  const entityExpansions = entityExpansion?.entities;
  const excludeSources = entityExpansion?.excludeSources;

  const [baseExpanded, domainHints] = await Promise.all([
    expandQuery(rawQuery, intent),
    Promise.resolve(extractDomainHints(rawQuery)),
  ]);

  // Inject entity-expanded queries for domain-specific searches
  // (e.g. "autonomous coding agent" → include SWE-agent, OpenHands queries).
  const expanded = entityExpansions && entityExpansions.length > 0
    ? [...baseExpanded.slice(0, 1), ...entityExpansions, ...baseExpanded.slice(1)]
    : baseExpanded;
  const providers = selectProviders(intent, rawQuery);

  // Inject entity-preferred sources at the front of the provider list
  if (entityExpansion) {
    for (const id of entityExpansion.preferredSources) {
      const p = providersById[id];
      if (p && !providers.includes(p)) {
        providers.unshift(p);
      }
    }
  }

  logger.info({ traceId, intent, language, providers: providers.map((p) => p.id) }, "search plan built");

  return {
    query: {
      raw: rawQuery,
      expanded,
      intent,
      intentSource,
      language,
      domainHints,
      newsCategory,
      newsKeywords,
      entityExpansions,
      excludeSources,
      limit: opts.limit,
      traceId,
    },
    providers,
  };
}
