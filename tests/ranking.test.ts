import { describe, it, expect } from "vitest";
import { trustScore } from "../src/modules/ranking/trust.js";
import { freshnessScore } from "../src/modules/ranking/freshness.js";
import { bm25Rank } from "../src/modules/ranking/bm25.js";
import { spamPenalty } from "../src/modules/ranking/spam.js";
import { popularityScore } from "../src/modules/ranking/popularity.js";
import { codeQualityScore } from "../src/modules/ranking/codeQuality.js";
import { hasExamplesScore } from "../src/modules/ranking/hasExamples.js";
import { authorityScore } from "../src/modules/ranking/authority.js";
import { computeFinalScore, reciprocalRankFusion } from "../src/modules/ranking/fusion.js";

describe("trustScore", () => {
  it("returns 100 for official framework docs", () => {
    expect(trustScore("https://react.dev/learn")).toBe(100);
    expect(trustScore("https://docs.python.org/3/library/")).toBe(100);
    expect(trustScore("https://nodejs.org/en/docs/")).toBe(100);
  });

  it("returns 99 for MDN", () => {
    expect(trustScore("https://developer.mozilla.org/en-US/docs/Web/JavaScript")).toBe(99);
  });

  it("returns 98 for IETF RFC sites and learn.microsoft.com", () => {
    expect(trustScore("https://rfc-editor.org/rfc/rfc7231")).toBe(98);
    expect(trustScore("https://datatracker.ietf.org/doc/html/rfc9110")).toBe(98);
    expect(trustScore("https://learn.microsoft.com/en-us/dotnet/")).toBe(98);
  });

  it("returns 96 for github.com", () => {
    expect(trustScore("https://github.com/microsoft/TypeScript")).toBe(96);
  });

  it("returns 95 for .edu domains", () => {
    expect(trustScore("https://cs.mit.edu/some-page")).toBe(95);
    expect(trustScore("https://stanford.edu/research")).toBe(95);
  });

  it("returns 80 for known high-quality blogs", () => {
    expect(trustScore("https://overreacted.io/writing-resilient-components/")).toBe(80);
    expect(trustScore("https://web.dev/articles/performance")).toBe(80);
  });

  it("returns 40 for unknown domains", () => {
    expect(trustScore("https://some-random-blog.xyz/post")).toBe(40);
    expect(trustScore("https://clickbait-site.com/article")).toBe(40);
  });

  it("returns 40 for unparseable URLs", () => {
    expect(trustScore("not-a-url")).toBe(40);
    expect(trustScore("")).toBe(40);
  });
});

describe("freshnessScore", () => {
  it("returns 50 for missing publishedAt", () => {
    expect(freshnessScore(undefined)).toBe(50);
  });

  it("returns 50 for unparseable date strings", () => {
    expect(freshnessScore("not-a-date")).toBe(50);
    expect(freshnessScore("")).toBe(50);
    expect(freshnessScore("unknown")).toBe(50);
  });

  it("returns 100 for a date from today (less than 1 day ago)", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(freshnessScore(oneHourAgo)).toBe(100);
  });

  it("returns 100 for a future date (treated as today)", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(freshnessScore(tomorrow)).toBe(100);
  });

  it("returns 95 for a date within the past week", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(freshnessScore(threeDaysAgo)).toBe(95);
  });

  it("returns 90 for a date within the past month", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    expect(freshnessScore(twoWeeksAgo)).toBe(90);
  });

  it("returns 75 for a date within 6 months", () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    expect(freshnessScore(threeMonthsAgo)).toBe(75);
  });

  it("returns 60 for a date within 1 year", () => {
    const eightMonthsAgo = new Date(Date.now() - 240 * 24 * 60 * 60 * 1000);
    expect(freshnessScore(eightMonthsAgo)).toBe(60);
  });

  it("returns 30 for a date older than 1 year", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
    expect(freshnessScore(twoYearsAgo)).toBe(30);
  });

  it("accepts ISO string dates", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
    expect(freshnessScore(twoYearsAgo.toISOString())).toBe(30);
  });
});

describe("bm25Rank", () => {
  const docs = [
    { id: "a", text: "TypeScript generics are useful for writing reusable code" },
    { id: "b", text: "JavaScript closures and scope explained in depth" },
    { id: "c", text: "TypeScript generics typescript generics typescript generics advanced patterns" },
    { id: "d", text: "Python machine learning with scikit-learn tutorial" },
  ];

  it("returns a map with an entry for every document", () => {
    const scores = bm25Rank("typescript generics", docs);
    expect(scores.size).toBe(docs.length);
    for (const doc of docs) {
      expect(scores.has(doc.id)).toBe(true);
    }
  });

  it("scores are in [0, 1]", () => {
    const scores = bm25Rank("typescript generics", docs);
    for (const score of scores.values()) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("the most relevant document gets score 1.0 (normalized max)", () => {
    const scores = bm25Rank("typescript generics", docs);
    const max = Math.max(...scores.values());
    expect(max).toBe(1);
  });

  it("ranks typescript-related docs above unrelated docs", () => {
    const scores = bm25Rank("typescript generics", docs);
    const scoreA = scores.get("a")!;
    const scoreD = scores.get("d")!;
    expect(scoreA).toBeGreaterThan(scoreD);
  });

  it("ranks unrelated docs at 0", () => {
    const scores = bm25Rank("typescript generics", docs);
    expect(scores.get("d")).toBe(0);
  });

  it("returns all-zero scores when query has no matching terms", () => {
    const scores = bm25Rank("xyzzy nonexistent foobar", docs);
    for (const score of scores.values()) {
      expect(score).toBe(0);
    }
  });

  it("handles empty documents array gracefully", () => {
    const scores = bm25Rank("anything", []);
    expect(scores.size).toBe(0);
  });

  it("handles empty query gracefully", () => {
    const scores = bm25Rank("", docs);
    for (const score of scores.values()) {
      expect(score).toBe(0);
    }
  });
});

describe("spamPenalty", () => {
  it("returns 0 for clean text", () => {
    const clean = "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.";
    expect(spamPenalty(clean)).toBe(0);
  });

  it("returns 0 for empty text", () => {
    expect(spamPenalty("")).toBe(0);
  });

  it("detects clickbait phrases", () => {
    const clickbait = "You won't believe this one weird trick! Doctors hate it! Click here now!";
    expect(spamPenalty(clickbait)).toBeGreaterThan(0);
  });

  it("detects keyword stuffing", () => {
    const stuffed = "buy buy buy cheap cheap cheap deals deals deals now now now limited limited time time time offer offer offer act act act fast fast fast".repeat(3);
    expect(spamPenalty(stuffed)).toBeGreaterThan(0);
  });
});

describe("popularityScore", () => {
  it("returns 0.5 for unknown provider", () => {
    expect(popularityScore("unknown", "https://example.com")).toBe(0.5);
  });

  it("returns 0.85 for GitHub", () => {
    expect(popularityScore("github", "https://github.com/test/repo")).toBe(0.85);
  });

  it("returns 0.95 for GitHub with stars in snippet", () => {
    expect(popularityScore("github", "https://github.com/test/repo", "12.5k stars")).toBe(0.95);
  });

  it("returns 0.8 for npm", () => {
    expect(popularityScore("npm", "https://www.npmjs.com/package/test")).toBe(0.8);
  });

  it("returns 0.9 for npm with downloads", () => {
    expect(popularityScore("npm", "https://www.npmjs.com/package/test", "1M downloads")).toBe(0.9);
  });

  it("returns 0.75 for PyPI", () => {
    expect(popularityScore("pypi", "https://pypi.org/project/test/")).toBe(0.75);
  });

  it("returns 0.7 for Wikipedia", () => {
    expect(popularityScore("wikipedia", "https://en.wikipedia.org/wiki/Test")).toBe(0.7);
  });

  it("returns 0.65 for Reddit", () => {
    expect(popularityScore("reddit", "https://reddit.com/r/test")).toBe(0.65);
  });

  it("returns 0.8 for Reddit with upvotes", () => {
    expect(popularityScore("reddit", "https://reddit.com/r/test", "1500 points")).toBe(0.8);
  });

  it("clamps score to [0, 1]", () => {
    expect(popularityScore("github", "https://github.com/test/repo")).toBeLessThanOrEqual(1);
    expect(popularityScore("github", "https://github.com/test/repo")).toBeGreaterThanOrEqual(0);
  });
});

describe("codeQualityScore", () => {
  it("returns 0.5 for unknown URL", () => {
    expect(codeQualityScore("https://example.com")).toBe(0.5);
  });

  it("returns 0.9 for GitHub", () => {
    expect(codeQualityScore("https://github.com/test/repo")).toBe(0.9);
  });

  it("returns 0.85 for gitlab.com", () => {
    expect(codeQualityScore("https://gitlab.com/test/project")).toBe(0.85);
  });

  it("returns 0.85 for npmjs.com", () => {
    expect(codeQualityScore("https://www.npmjs.com/package/test")).toBe(0.85);
  });

  it("returns 0.9 for docs.rs", () => {
    expect(codeQualityScore("https://docs.rs/test/")).toBe(0.9);
  });

  it("returns 0.75 for code-heavy snippet", () => {
    const snippet = "How to use TypeScript with React. Install npm install react-typescript. The function interface extends...";
    expect(codeQualityScore("https://blog.example.com", snippet)).toBe(0.75);
  });

  it("returns 0.6 for mildly technical snippet", () => {
    expect(codeQualityScore("https://blog.example.com", "Using the Python API")).toBe(0.6);
  });

  it("returns 0.5 for non-technical content", () => {
    expect(codeQualityScore("https://blog.example.com", "A great vacation spot")).toBe(0.5);
  });
});

describe("hasExamplesScore", () => {
  it("returns 0.5 for empty text", () => {
    expect(hasExamplesScore("")).toBe(0.5);
  });

  it("returns 0.85 for a code block", () => {
    expect(hasExamplesScore("Here is some code:\n```\nconst x = 1;\n```\nEnd.")).toBe(0.85);
  });

  it("returns 0.95 for 3+ code blocks", () => {
    const text = "```a```\n```b```\n```c```";
    expect(hasExamplesScore(text)).toBe(0.95);
  });

  it("returns 0.75 for multiple inline codes", () => {
    expect(hasExamplesScore("Use `map()`, `filter()`, `reduce()`, `flatMap()`, and `forEach()`")).toBe(0.75);
  });

  it("returns 0.65 for a couple inline codes", () => {
    expect(hasExamplesScore("Use `map()` and `filter()`")).toBe(0.65);
  });

  it("returns 0.6 for example keyword", () => {
    expect(hasExamplesScore("Here is an example of using React hooks")).toBe(0.6);
  });

  it("returns 0.5 for plain text with no examples", () => {
    expect(hasExamplesScore("This is just regular text without any code or examples.")).toBe(0.5);
  });
});

describe("authorityScore", () => {
  it("returns 0.5 for unknown URL", () => {
    expect(authorityScore("https://example.com")).toBe(0.5);
  });

  it("returns high score for high-authority domains", () => {
    expect(authorityScore("https://react.dev/learn")).toBeGreaterThanOrEqual(0.85);
    expect(authorityScore("https://developer.mozilla.org/en-US/")).toBeGreaterThanOrEqual(0.85);
    expect(authorityScore("https://kubernetes.io/docs/")).toBeGreaterThanOrEqual(0.85);
    expect(authorityScore("https://w3.org/TR/")).toBeGreaterThanOrEqual(0.85);
  });

  it("returns trust-score-based value when provided", () => {
    expect(authorityScore("https://example.com", undefined, 80)).toBe(0.8);
  });

  it("boosts score for named authors", () => {
    const base = authorityScore("https://example.com", undefined, 50);
    const boosted = authorityScore("https://example.com", "john-doe", 50);
    expect(boosted).toBeGreaterThan(base);
  });

  it("boosts score more for real-name pattern authors", () => {
    const normal = authorityScore("https://example.com", "someuser", 50);
    const realName = authorityScore("https://example.com", "dan.abramov", 50);
    expect(realName).toBeGreaterThan(normal);
  });
});

describe("computeFinalScore", () => {
  it("returns a score in 0-100 range", () => {
    const score = computeFinalScore({
      trust: 80, freshness: 70, aiRelevance: 0.8,
      semanticSimilarity: 0.7, bm25: 0.6, spamPenalty: 0,
      popularity: 0.7, codeQuality: 0.7, hasExamples: 0.6, authority: 0.7,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns higher score for better signals", () => {
    const good = computeFinalScore({
      trust: 100, freshness: 100, aiRelevance: 1,
      semanticSimilarity: 1, bm25: 1, spamPenalty: 0,
      popularity: 1, codeQuality: 1, hasExamples: 1, authority: 1,
    });
    const bad = computeFinalScore({
      trust: 40, freshness: 30, aiRelevance: 0,
      semanticSimilarity: 0, bm25: 0, spamPenalty: 100,
      popularity: 0, codeQuality: 0, hasExamples: 0, authority: 0,
    });
    expect(good).toBeGreaterThan(bad);
  });

  it("applies spam as a penalty (reduces score)", () => {
    const noSpam = computeFinalScore({
      trust: 50, freshness: 50, aiRelevance: 0.5,
      semanticSimilarity: 0.5, bm25: 0.5, spamPenalty: 0,
      popularity: 0.5, codeQuality: 0.5, hasExamples: 0.5, authority: 0.5,
    });
    const spammy = computeFinalScore({
      trust: 50, freshness: 50, aiRelevance: 0.5,
      semanticSimilarity: 0.5, bm25: 0.5, spamPenalty: 80,
      popularity: 0.5, codeQuality: 0.5, hasExamples: 0.5, authority: 0.5,
    });
    expect(noSpam).toBeGreaterThan(spammy);
  });

  it("spamPenalty is never applied more than once (regression: double-count)", () => {
    // Calling computeFinalScore once with spamPenalty=40 should produce the
    // same result as calling a pure weighted-sum and subtracting once.
    // If spam were deducted twice, the result would be exactly 10pts lower.
    const signals = {
      trust: 80, freshness: 70, aiRelevance: 0.8,
      semanticSimilarity: 0.7, bm25: 0.6, spamPenalty: 40,
      popularity: 0.7, codeQuality: 0.7, hasExamples: 0.6, authority: 0.7,
    };
    const once = computeFinalScore(signals);
    // The manual single-deduction result
    const positiveSum =
      (signals.trust / 100) * 0.20 +
      signals.aiRelevance * 0.20 +
      signals.semanticSimilarity * 0.13 +
      signals.bm25 * 0.11 +
      (signals.freshness / 100) * 0.10 +
      0.5 * 0.10 +
      signals.popularity * 0.05 +
      signals.codeQuality * 0.04 +
      signals.hasExamples * 0.03 +
      signals.authority * 0.02;
    const deduction = (signals.spamPenalty / 100) * 0.25;
    const expected = Math.min(Math.max((positiveSum - deduction) * 100, 0), 100);
    expect(once).toBe(expected);
  });

  it("computeFinalScore is deterministic (same inputs → same output)", () => {
    const signals = {
      trust: 80, freshness: 70, aiRelevance: 0.8,
      semanticSimilarity: 0.7, bm25: 0.6, spamPenalty: 0,
      popularity: 0.7, codeQuality: 0.7, hasExamples: 0.6, authority: 0.7,
    };
    const results = Array.from({ length: 20 }, () => computeFinalScore(signals));
    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it("keyword boost increases score when provided", () => {
    const signals = {
      trust: 50, freshness: 50, aiRelevance: 0.5,
      semanticSimilarity: 0.5, bm25: 0.5, spamPenalty: 0,
      popularity: 0.5, codeQuality: 0.5, hasExamples: 0.5, authority: 0.5,
    };
    const base = computeFinalScore(signals);
    const boosted = computeFinalScore(signals, 1.5);
    expect(boosted).toBeCloseTo(base * 1.5, 1);
  });

  it("BM25=0 penalty pushes off-topic results out of top 10", () => {
    // A result with BM25≈0 (no keyword overlap) and moderate semantic (0.5)
    // should score much lower than the same result with BM25=0.3
    const lowBm25 = computeFinalScore({
      trust: 60, freshness: 50, aiRelevance: 0.5,
      semanticSimilarity: 0.5, bm25: 0.001, spamPenalty: 0,
      popularity: 0.5, codeQuality: 0.5, hasExamples: 0.5, authority: 0.5,
    });
    const hasKeywords = computeFinalScore({
      trust: 60, freshness: 50, aiRelevance: 0.5,
      semanticSimilarity: 0.5, bm25: 0.3, spamPenalty: 0,
      popularity: 0.5, codeQuality: 0.5, hasExamples: 0.5, authority: 0.5,
    });
    // BM25=0 result should be at least 15 points lower due to the penalty
    expect(hasKeywords - lowBm25).toBeGreaterThanOrEqual(15);
  });

  it("BM25 false-match penalty reduces score when BM25 high and semantic low", () => {
    // BM25=0.9, semantic=0.3 → BM25 penalized to 0.45
    const signals = {
      trust: 50, freshness: 50, aiRelevance: 0.5,
      semanticSimilarity: 0.3, bm25: 0.9, spamPenalty: 0,
      popularity: 0.5, codeQuality: 0.5, hasExamples: 0.5, authority: 0.5,
    };
    const penalized = computeFinalScore(signals);

    // Manual: BM25 effective = 0.9 * 0.5 = 0.45
    const raw =
      (50 / 100) * 0.20 + 0.5 * 0.20 + 0.3 * 0.13 + 0.45 * 0.11 +
      (50 / 100) * 0.10 + 0.5 * 0.10 + 0.5 * 0.05 + 0.5 * 0.04 + 0.5 * 0.03 + 0.5 * 0.02;
    const expected = Math.min(Math.max(raw * 100, 0), 100);
    expect(penalized).toBe(expected);
  });

  it("BM25 penalty NOT applied when semantic similarity is high", () => {
    const signals = {
      trust: 50, freshness: 50, aiRelevance: 0.5,
      semanticSimilarity: 0.7, bm25: 0.9, spamPenalty: 0,
      popularity: 0.5, codeQuality: 0.5, hasExamples: 0.5, authority: 0.5,
    };
    const result = computeFinalScore(signals);
    // With sem=0.7, BM25 stays at 0.9 (no penalty)
    const raw =
      (50 / 100) * 0.20 + 0.5 * 0.20 + 0.7 * 0.13 + 0.9 * 0.11 +
      (50 / 100) * 0.10 + 0.5 * 0.10 + 0.5 * 0.05 + 0.5 * 0.04 + 0.5 * 0.03 + 0.5 * 0.02;
    const expected = Math.min(Math.max(raw * 100, 0), 100);
    expect(result).toBe(expected);
  });
});

describe("reciprocalRankFusion", () => {
  it("returns empty map for empty input", () => {
    const result = reciprocalRankFusion([]);
    expect(result.size).toBe(0);
  });

  it("fuses multiple rankings", () => {
    const r1 = new Map([["a", 10], ["b", 5], ["c", 1]]);
    const r2 = new Map([["b", 10], ["c", 5], ["a", 1]]);
    const result = reciprocalRankFusion([r1, r2]);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
    expect(result.has("c")).toBe(true);
  });

  it("normalizes scores to 0-1", () => {
    const r1 = new Map([["a", 10], ["b", 5]]);
    const result = reciprocalRankFusion([r1]);
    for (const score of result.values()) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("top result gets 1.0", () => {
    const r1 = new Map([["a", 10], ["b", 0]]);
    const result = reciprocalRankFusion([r1]);
    expect(result.get("a")).toBe(1);
  });
});
