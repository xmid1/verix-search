import { describe, it, expect } from "vitest";
import { sourceQualityScore } from "../src/modules/ranking/sourceQuality.js";

describe("sourceQualityScore", () => {
  it("scores arxiv papers high", () => {
    const score = sourceQualityScore("https://arxiv.org/abs/2601.07595", "arxiv");
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("scores semantic scholar high", () => {
    const score = sourceQualityScore("https://api.semanticscholar.org/paper/123", "semanticscholar");
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("scores github repos high", () => {
    const score = sourceQualityScore("https://github.com/princeton-nlp/SWE-agent", "github");
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it("scores MDN docs decently", () => {
    const score = sourceQualityScore("https://developer.mozilla.org/en-US/docs/Web/API", "mdn");
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("scores dev.to lower", () => {
    const score = sourceQualityScore("https://dev.to/some-author/some-post", "devto");
    expect(score).toBeLessThanOrEqual(0.4);
  });

  it("scores medium lower", () => {
    const score = sourceQualityScore("https://medium.com/some-post", "medium");
    expect(score).toBeLessThanOrEqual(0.35);
  });

  it("penalizes listicle URLs", () => {
    const score = sourceQualityScore("https://example.com/top-10-ai-frameworks-2026");
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it("penalizes best-N patterns", () => {
    const score = sourceQualityScore("https://example.com/the-12-best-tools");
    expect(score).toBeLessThanOrEqual(0.3);
  });

  it("provides neutral baseline for unknown source", () => {
    const score = sourceQualityScore("https://example.com/some-page");
    expect(score).toBeGreaterThanOrEqual(0.35);
    expect(score).toBeLessThanOrEqual(0.55);
  });
});
