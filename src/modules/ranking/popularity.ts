export function popularityScore(provider?: string, url?: string, snippet?: string): number {
  if (!url) return 0.5;

  let score = 0.5;

  if (provider === "github") {
    score = 0.85;
    if (snippet && /\d+[kK]?\s*stars/i.test(snippet)) score = 0.95;
  } else if (provider === "npm") {
    score = 0.8;
    if (snippet && /\d+[kKmMbB]?\s*(downloads|weekly)/i.test(snippet)) score = 0.9;
  } else if (provider === "pypi") {
    score = 0.75;
    if (snippet && /\d+[kKmMbB]?\s*downloads/i.test(snippet)) score = 0.85;
  } else if (provider === "stackexchange") {
    score = 0.75;
    if (snippet && /\d+[kK]?\s*views/i.test(snippet)) score = 0.85;
  } else if (provider === "reddit" || provider === "hackernews") {
    score = 0.65;
    if (snippet && /\d+\s*(points?|comments?|upvotes?)/i.test(snippet)) score = 0.8;
  } else if (provider === "wikipedia") {
    score = 0.7;
  } else if (provider === "arxiv" || provider === "crossref") {
    score = 0.6;
    if (snippet && /\d+\s*citations/i.test(snippet)) score = 0.8;
  } else if (provider === "mdn") {
    score = 0.75;
  }

  return Math.min(Math.max(score, 0), 1);
}
