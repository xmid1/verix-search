import { describe, it, expect } from "vitest";
import { computeFinalScore } from "../src/modules/ranking/fusion.js";
import type { RankingSignals } from "../src/core/types.js";

describe("computeFinalScore determinism (P0)", () => {
  it("same signals → same score bit-for-bit across 10 calls", () => {
    const signals: RankingSignals = {
      trust: 80,
      freshness: 50,
      aiRelevance: 0.5,
      semanticSimilarity: 0.72,
      bm25: 0.61,
      spamPenalty: 5,
      popularity: 0.85,
      codeQuality: 0.9,
      hasExamples: 0.5,
      authority: 1,
      sourceQuality: 0.8,
    };
    const expected = computeFinalScore(signals, 1.0);
    for (let i = 0; i < 10; i++) {
      expect(computeFinalScore(signals, 1.0)).toBe(expected);
    }
  });

  it("same signals with keywordBoost → same score bit-for-bit across 10 calls", () => {
    const signals: RankingSignals = {
      trust: 96,
      freshness: 100,
      aiRelevance: 0.5,
      semanticSimilarity: 0.8,
      bm25: 1,
      spamPenalty: 0,
      popularity: 0.85,
      codeQuality: 0.9,
      hasExamples: 0.5,
      authority: 1,
      sourceQuality: 0.8,
    };
    const expected = computeFinalScore(signals, 1.5);
    for (let i = 0; i < 10; i++) {
      expect(computeFinalScore(signals, 1.5)).toBe(expected);
    }
  });

  it("zero signals edge case is stable", () => {
    const signals: RankingSignals = {
      trust: 0,
      freshness: 0,
      aiRelevance: 0,
      semanticSimilarity: 0,
      bm25: 0,
      spamPenalty: 100,
      popularity: 0,
      codeQuality: 0,
      hasExamples: 0,
      authority: 0,
      sourceQuality: 0,
    };
    const expected = computeFinalScore(signals, 1.0);
    for (let i = 0; i < 10; i++) {
      expect(computeFinalScore(signals, 1.0)).toBe(expected);
    }
  });
});
