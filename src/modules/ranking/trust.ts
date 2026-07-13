/**
 * Trust score based on source domain reputation.
 *
 * Domain-tier table (easy to extend — just add entries to the maps/lists below):
 *   Tier 100: Official docs of well-known frameworks / *.dev for their own framework
 *   Tier 99:  developer.mozilla.org
 *   Tier 98:  learn.microsoft.com, rfc-editor.org, datatracker.ietf.org
 *   Tier 96:  github.com
 *   Tier 95:  *.edu domains
 *   Tier 80:  Known high-quality blogs / dev sites
 *   Tier 40:  Everything else (default)
 *
 * Note: TRUSTED_DOMAINS is the shared list used by both trust.ts and authority.ts.
 * Always update both systems by adding to EXACT_SCORES below.
 */

/** Exact hostname -> score */
const EXACT_SCORES: Record<string, number> = {
  // Official documentation portals — tier 100
  "docs.python.org": 100,
  "docs.rust-lang.org": 100,
  "doc.rust-lang.org": 100,
  "docs.oracle.com": 100,
  "docs.swift.org": 100,
  "docs.djangoproject.com": 100,
  "docs.spring.io": 100,
  "docs.nestjs.com": 100,
  "docs.astro.build": 100,
  "nuxt.com": 100,
  "nextjs.org": 100,
  "react.dev": 100,
  "vuejs.org": 100,
  "angular.dev": 100,
  "svelte.dev": 100,
  "kit.svelte.dev": 100,
  "solidjs.com": 100,
  "remix.run": 100,
  "laravel.com": 100,
  "rubyonrails.org": 100,
  "go.dev": 100,
  "kotlinlang.org": 100,
  "typescriptlang.org": 100,
  "nodejs.org": 100,
  "deno.land": 100,
  "bun.sh": 100,
  "webpack.js.org": 100,
  "vitejs.dev": 100,
  "esbuild.github.io": 100,
  "rollupjs.org": 100,
  "jestjs.io": 100,
  "vitest.dev": 100,
  "playwright.dev": 100,
  "docs.docker.com": 100,
  "kubernetes.io": 100,
  "terraform.io": 100,
  "docs.aws.amazon.com": 100,
  "cloud.google.com": 100,
  "learn.microsoft.com": 98,

  // MDN — tier 99
  "developer.mozilla.org": 99,

  // IETF RFC — tier 98
  "rfc-editor.org": 98,
  "datatracker.ietf.org": 98,

  // GitHub — tier 96
  "github.com": 96,

  // High-quality developer blogs — tier 80
  "overreacted.io": 80,
  "kentcdodds.com": 80,
  "addyosmani.com": 80,
  "2ality.com": 80,
  "jakearchibald.com": 80,
  "web.dev": 80,
  "css-tricks.com": 80,
  "smashingmagazine.com": 80,
  "martinfowler.com": 80,
  "blog.jbrains.ca": 80,
  "increment.com": 80,
  "changelog.com": 80,
  "thenewstack.io": 80,
  "blog.rust-lang.org": 80,
  "blog.golang.org": 80,
  "v8.dev": 80,
  "webkit.org": 80,
  "hacks.mozilla.org": 80,
  "engineering.atspotify.com": 80,
  "netflixtechblog.com": 80,
  "engineering.fb.com": 80,
  "research.google": 80,

  // AI/ML & Data Science platforms — tier 80
  "huggingface.co": 80,
  "pytorch.org": 100,
  "tensorflow.org": 100,
  "jax.readthedocs.io": 80,
  "mlflow.org": 80,
  "wandb.ai": 80,
  "arxiv.org": 95,
  "paperswithcode.com": 85,
  "openai.com": 95,
  "platform.openai.com": 90,
  "docs.anthropic.com": 90,
  "docs.cohere.com": 80,
  "lilianweng.github.io": 85,
  "learnprompting.org": 75,
  "promptingguide.ai": 75,
  "github.blog": 80,
  "simonwillison.net": 80,
  "stability.ai": 80,
  "replicate.com": 80,
  "langchain.com": 80,
  "python.langchain.com": 80,
  "js.langchain.com": 80,
  "llamaindex.ai": 80,
  "docs.llamaindex.ai": 80,
  "blog.langchain.dev": 75,

  // Cloud & DevOps — tier 80
  "digitalocean.com": 75,
  "linode.com": 75,
  "dev.to": 70,
  "medium.com": 60,
  "betterprogramming.pub": 65,
  "levelup.gitconnected.com": 60,
  "towardsdatascience.com": 70,
  "aws.amazon.com": 90,
  "console.aws.amazon.com": 85,
  "azure.microsoft.com": 85,
  "firebase.google.com": 80,
  "docs.supabase.com": 80,
  "planetscale.com": 75,
  "neon.tech": 75,
  "vercel.com": 80,
  "docs.vercel.com": 85,
  "netlify.com": 75,
  "fly.io": 75,
  "railway.app": 70,
  "render.com": 70,

  // Package registries & tooling
  "npmjs.com": 85,
  "pypi.org": 85,
  "crates.io": 85,
  "rubygems.org": 80,
  "packagist.org": 75,
  "nuget.org": 80,
  "codecov.io": 70,
  "sonarcloud.io": 70,
  "circleci.com": 75,
  "githubactions.com": 75,

  // Standards & academic
  "w3.org": 90,
  "whatwg.org": 90,
  "ietf.org": 90,
  "ieee.org": 85,
  "acm.org": 85,
  "springer.com": 80,
  "link.springer.com": 80,
  "sciencedirect.com": 80,
  "nature.com": 80,
  "plos.org": 75,
  "jmlr.org": 85,
  "proceedings.mlr.press": 85,
  "openreview.net": 75,
};

/** Hostname suffix -> score (checked as endsWith(".suffix") or exact "suffix") */
const SUFFIX_SCORES: Array<{ suffix: string; score: number }> = [
  // *.edu — tier 95
  { suffix: ".edu", score: 95 },
];

/**
 * Returns a trust score (0-100) for a given URL based on its hostname.
 * Higher is more trustworthy.
 */
export function trustScore(url: string): number {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return 40;
  }

  // Strip www. prefix for matching — most entries in EXACT_SCORES omit www.
  const stripped = hostname.replace(/^www\./, "");

  // 1. Exact match (try stripped first, then original)
  const exact = EXACT_SCORES[stripped] ?? EXACT_SCORES[hostname];
  if (exact !== undefined) return exact;

  // 2. Suffix match (e.g. *.edu) — match against both stripped and original
  for (const { suffix, score } of SUFFIX_SCORES) {
    if (stripped.endsWith(suffix) || hostname.endsWith(suffix)) return score;
  }

  // 3. Default
  return 40;
}

/**
 * High-authority domains (official docs, standards bodies, major platforms).
 * A smaller subset of EXACT_SCORES — excludes blog/community tier-80 sites.
 * Used by both trust.ts and authority.ts as a unified source of truth.
 */
export const HIGH_AUTHORITY_DOMAINS: string[] = [
  // Official docs (tier 100)
  "docs.python.org", "docs.rust-lang.org", "doc.rust-lang.org",
  "docs.oracle.com", "docs.swift.org", "docs.djangoproject.com",
  "docs.spring.io", "docs.nestjs.com", "docs.astro.build",
  "nuxt.com", "nextjs.org", "react.dev", "vuejs.org",
  "angular.dev", "svelte.dev", "kit.svelte.dev", "solidjs.com",
  "remix.run", "laravel.com", "rubyonrails.org",
  "go.dev", "kotlinlang.org", "typescriptlang.org",
  "nodejs.org", "deno.land", "bun.sh",
  "webpack.js.org", "vitejs.dev", "esbuild.github.io",
  "rollupjs.org", "jestjs.io", "vitest.dev", "playwright.dev",
  "docs.docker.com", "kubernetes.io", "terraform.io",
  "docs.aws.amazon.com", "cloud.google.com", "learn.microsoft.com",
  "pytorch.org", "tensorflow.org",
  // MDN + IETF (tier 99/98)
  "developer.mozilla.org", "rfc-editor.org", "datatracker.ietf.org",
  // GitHub (tier 96)
  "github.com",
  // AI/ML & academic
  "openai.com", "platform.openai.com", "docs.anthropic.com",
  "huggingface.co", "arxiv.org", "paperswithcode.com",
  "langchain.com", "python.langchain.com", "llamaindex.ai",
  "lilianweng.github.io", "openreview.net",
  // Standards bodies
  "w3.org", "whatwg.org", "ietf.org",
  // Major platforms
  "stackoverflow.com", "stackoverflow.co", "ieee.org", "acm.org",
  "spring.io", "hibernate.org", "apache.org",
  "elastic.co", "redis.io", "mongodb.com", "postgresql.org",
  "sqlite.org", "prisma.io", "tailwindcss.com", "getbootstrap.com",
  "npmjs.com", "pypi.org", "crates.io",
  "aws.amazon.com", "azure.microsoft.com", "supabase.com",
  "vercel.com", "neon.tech",
  "jmlr.org", "proceedings.mlr.press",
  "opencode.ai",
];

