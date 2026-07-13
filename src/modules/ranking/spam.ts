/**
 * Spam / low-quality content penalty heuristics.
 *
 * Returns a score 0-100 where HIGHER means MORE spammy.
 * Three heuristics are combined:
 *   1. Keyword-stuffing ratio — top word frequency relative to total tokens
 *   2. Clickbait phrase detection — known bait phrases + excessive punctuation + ALL-CAPS ratio
 *   3. Ad-heaviness proxy — short paragraphs that contain URLs (crude link-density measure)
 *
 * Trusted domains (trustScore ≥ 80 like MDN, docs.official, w3.org) get 90% reduction
 * because technical documentation naturally repeats terms and is NEVER spam.
 *
 * This is intentionally deterministic and rule-based, not ML.
 */

const CLICKBAIT_PHRASES: string[] = [
  "you won't believe",
  "you will not believe",
  "mind blowing",
  "mind-blowing",
  "top 10",
  "top 5",
  "top 3",
  "number one",
  "shocking",
  "jaw dropping",
  "jaw-dropping",
  "life changing",
  "life-changing",
  "secret revealed",
  "doctors hate",
  "one weird trick",
  "click here",
  "don't miss",
  "do not miss",
  "limited time",
  "act now",
  "free money",
  "make money fast",
  "get rich",
  "lose weight fast",
];

/** Tokenize text to lowercase words (split on non-alphanumeric). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Heuristic 1: keyword-stuffing ratio.
 * Finds the most frequent non-stopword token and measures its frequency.
 * Returns 0-1 (1 = extremely stuffed).
 *
 * Uses a 15% threshold (up from 5%) to avoid false positives on technical docs
 * where terms like "React", "component", "function" repeat naturally.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "it", "its", "this", "that",
  "as", "if", "not", "so", "we", "you", "he", "she", "they", "i", "my",
  "your", "our", "their", "can", "will", "would", "could", "should",
]);

function keywordStuffingRatio(tokens: string[]): number {
  if (tokens.length < 20) return 0;

  const freq = new Map<string, number>();
  for (const t of tokens) {
    if (!STOPWORDS.has(t)) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  if (freq.size === 0) return 0;

  const maxFreq = Math.max(...freq.values());
  const ratio = maxFreq / tokens.length;

  // Raised threshold: 15% (was 5%) — technical docs naturally repeat terms
  return Math.min(ratio / 0.15, 1);
}

/**
 * Heuristic 2: clickbait signals.
 * Combines phrase matching, excessive exclamation marks, and ALL-CAPS word ratio.
 * Returns 0-1.
 */
function clickbaitSignal(text: string): number {
  let score = 0;

  const lower = text.toLowerCase();
  for (const phrase of CLICKBAIT_PHRASES) {
    if (lower.includes(phrase)) {
      score += 0.2;
    }
  }

  const exclamationCount = (text.match(/!/g) ?? []).length;
  const exclamationDensity = exclamationCount / Math.max(text.length / 500, 1);
  if (exclamationDensity > 2) score += 0.3;

  const words = text.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length > 0) {
    const capsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
    const capsRatio = capsWords.length / words.length;
    if (capsRatio > 0.2) score += 0.3;
  }

  return Math.min(score, 1);
}

/**
 * Heuristic 3: ad-heaviness proxy.
 * Counts short paragraphs (<=80 chars) that contain a URL-like pattern.
 * Returns 0-1.
 */
function adHeavinessSignal(text: string): number {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return 0;

  const URL_RE = /https?:\/\/|www\./i;
  const shortLinkParas = paragraphs.filter(
    (p) => p.trim().length <= 80 && URL_RE.test(p)
  );

  const ratio = shortLinkParas.length / paragraphs.length;
  return Math.min(ratio / 0.3, 1);
}

/**
 * Returns spam penalty 0-100 (higher = more spammy).
 * Weights: keyword stuffing 40%, clickbait 40%, ad-heaviness 20%.
 *
 * If trustScore is provided and >= 80 (official/authoritative domain),
 * the penalty is reduced by 90% — trusted docs are never spam.
 *
 * If intent is "news", penalty is halved — news articles about topics
 * like "hackers" or "breach" are legitimate, not spam.
 */
export function spamPenalty(text: string, trustScore?: number, intent?: string): number {
  if (!text || text.trim().length === 0) return 0;

  const tokens = tokenize(text);
  const stuffing = keywordStuffingRatio(tokens);
  const clickbait = clickbaitSignal(text);
  const ads = adHeavinessSignal(text);

  const raw = stuffing * 0.4 + clickbait * 0.4 + ads * 0.2;
  let penalty = Math.round(Math.min(raw * 100, 100));

  // Trusted domains (MDN, official docs, .edu, w3.org, etc.) get 90% reduction
  if (trustScore !== undefined && trustScore >= 80) {
    penalty = Math.round(penalty * 0.1);
  }

  // News intent: halve penalty — news about "hackers"/"breach" is not spam
  if (intent === "news") {
    penalty = Math.round(penalty * 0.5);
  }

  return penalty;
}
