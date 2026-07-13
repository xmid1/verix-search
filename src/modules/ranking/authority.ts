import { HIGH_AUTHORITY_DOMAINS } from "./trust.js";

export function authorityScore(url?: string, author?: string, trustScoreValue?: number): number {
  if (!url) return 0.5;

  let score = 0.5;

  // If we have trust score, use it as a strong signal
  if (trustScoreValue !== undefined) {
    score = trustScoreValue / 100;
  }

  // Check if domain is in high-authority list
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const isHighAuthority = HIGH_AUTHORITY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
    if (isHighAuthority) score = Math.max(score, 0.85);
  } catch {
    // unparseable URL, keep default
  }

  // Authors boost
  if (author) {
    if (/^[a-z-]+\.[a-z-]+$/i.test(author)) {
      // Looks like a real name (first.last pattern)
      score = Math.min(score + 0.15, 1);
    } else {
      score = Math.min(score + 0.05, 1);
    }
  }

  return Math.min(Math.max(score, 0), 1);
}
