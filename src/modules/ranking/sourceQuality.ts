/**
 * Source quality scoring.
 *
 * Assigns a 0-1 quality score based on the provider and URL patterns.
 * Academic papers and official sources get high scores;
 * SEO-optimized blogs and listicles get low scores.
 */

const PROVIDER_QUALITY: Record<string, number> = {
  arxiv: 0.95,
  semanticscholar: 0.95,
  pubmed: 0.95,
  crossref: 0.85,
  github: 0.80,
  mdn: 0.75,
  wikipedia: 0.70,
  googlenews: 0.60,
  hackernews: 0.55,
  twitter: 0.45,
  stackexchange: 0.50,
  reddit: 0.40,
  devto: 0.35,
  medium: 0.30,
  brave: 0.45,
  duckduckgo: 0.45,
};

const URL_QUALITY_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  // Academic venues
  { pattern: /\.(edu|ac\.uk|ac\.jp|ac\.kr|ac\.cn|ac\.in|edu\.au)\//i, score: 0.90 },
  { pattern: /\/doi\.org\//i, score: 0.85 },
  { pattern: /\/papers?\.[a-z]+\//i, score: 0.80 },
  { pattern: /\/proceedings\//i, score: 0.80 },
  // Official documentation
  { pattern: /\/docs\./i, score: 0.75 },
  { pattern: /\/learn\//i, score: 0.70 },
  { pattern: /\/tutorials?\//i, score: 0.65 },
  // GitHub repos (owner/name pattern)
  { pattern: /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i, score: 0.80 },
  // News sites
  { pattern: /\.(reuters|bloomberg|bbc|cnn|nytimes|theguardian|washingtonpost)\.com/i, score: 0.65 },
  // SEO spam signals
  { pattern: /\/?(best|top|most)\s*\d+\s/i, score: 0.20 },
  { pattern: /\d+\s*(best|top|reasons|ways|tips|tricks|hacks)\s/i, score: 0.15 },
  { pattern: /(vocal|medium)\.com/i, score: 0.25 },
];

export function sourceQualityScore(url: string, provider?: string): number {
  let score = 0.45; // neutral baseline

  // Provider-based scoring
  if (provider && PROVIDER_QUALITY[provider] !== undefined) {
    score = PROVIDER_QUALITY[provider];
  }

  // URL pattern overrides
  for (const { pattern, score: patternScore } of URL_QUALITY_PATTERNS) {
    if (pattern.test(url)) {
      score = Math.max(score, patternScore);
      break;
    }
  }

  // Penalize SEO listicle patterns in URL or known blog farms
  const lowerUrl = url.toLowerCase();
  if (/\/(best|top|most)[\s-]?\d+/i.test(lowerUrl) || /\d+[\s-]?(best|top|reason|way|tip|trick)/i.test(lowerUrl)) {
    score = Math.min(score, 0.25);
  }

  return Math.max(0, Math.min(1, score));
}
