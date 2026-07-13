import { describe, it, expect } from "vitest";
import { computeConfidence } from "../src/modules/research/confidence.js";

describe("computeConfidence — relevance multiplier", () => {
  it("98 with strong signals and no relevance score is capped", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://angular.io", title: "Angular", trustScore: 90 },
        { url: "https://blog.example.com", title: "Blog", trustScore: 80 },
        { url: "https://github.com", title: "Git", trustScore: 96 },
        { url: "https://stackoverflow.com", title: "SO", trustScore: 50 },
      ],
      contradictions: [],
      hasOfficialSource: true,
      hasCodeExample: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it("low AI relevance score drastically reduces confidence", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://angular.io", title: "Angular Tutorial", trustScore: 90 },
        { url: "https://blog.example.com", title: "Old Angular Post", trustScore: 80 },
        { url: "https://github.com", title: "Angular Repo", trustScore: 96 },
        { url: "https://stackoverflow.com", title: "Angular Question", trustScore: 50 },
      ],
      contradictions: [],
      hasOfficialSource: true,
      hasCodeExample: false,
      aiRelevanceScore: 0.15,
    });
    // Base: 40+32+15.8+10+0 = 97.8. Multiplier: 0.15/0.5 = 0.3. Score: 97.8*0.3 = 29
    expect(result.score).toBe(29);
  });

  it("very low AI relevance score with no official source gives low confidence", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://some-blog.com", title: "Random", trustScore: 40 },
        { url: "https://another-blog.com", title: "Random 2", trustScore: 40 },
      ],
      contradictions: [],
      hasOfficialSource: false,
      hasCodeExample: false,
      aiRelevanceScore: 0.1,
    });
    // Base: 40+16+8 = 64. Multiplier: 0.1/0.5 = 0.2. Score: 64*0.2 = 13
    expect(result.score).toBe(13);
  });
});

describe("computeConfidence — summary hedging penalty", () => {
  it("detects 'do not provide' in summary and reduces score", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://angular.io", title: "Angular", trustScore: 90 },
        { url: "https://github.com", title: "Git", trustScore: 96 },
        { url: "https://stackoverflow.com", title: "SO", trustScore: 50 },
      ],
      contradictions: [],
      hasOfficialSource: true,
      hasCodeExample: true,
      summary: "The provided sources do not provide a clear definition of TypeScript...",
    });
    // Base: 40+24+15.7+10+5 = 94.7. Hedging: -35. Score: 60
    expect(result.score).toBe(60);
  });

  it("detects multiple hedging phrases — still 35-point flat penalty", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://angular.io", title: "Angular", trustScore: 90 },
      ],
      contradictions: [],
      hasOfficialSource: false,
      hasCodeExample: false,
      summary: "The sources do not contain relevant information. It is not clear what the answer is. No direct evidence was found.",
    });
    // Base: 40+8+18 = 66. Hedging (flat -35). Score: 31
    expect(result.score).toBe(31);
  });

  it("clean summary without hedging has no penalty", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://react.dev", title: "React", trustScore: 100 },
        { url: "https://nodejs.org", title: "Node", trustScore: 100 },
        { url: "https://github.com", title: "GitHub", trustScore: 96 },
      ],
      contradictions: [],
      hasOfficialSource: true,
      hasCodeExample: true,
      aiRelevanceScore: 0.92,
      summary: "React Server Components run on the server and send zero JavaScript to the client. They allow direct data access.",
    });
    // Base: 98.7. Multiplier 0.92/0.5 = 1.84 → 181 → capped at 100. No hedging.
    expect(result.score).toBeGreaterThanOrEqual(85);
  });
});

describe("computeConfidence — combined real-world scenario", () => {
  it("TypeScript question answered with unrelated Angular 2 sources → low confidence", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://angular.io", title: "Angular 2 Tutorial", trustScore: 100 },
        { url: "https://github.com/angular/angular", title: "Angular Repo", trustScore: 96 },
        { url: "https://blog.example.com/angular2", title: "Angular 2 Setup", trustScore: 40 },
        { url: "https://stackoverflow.com/angular2", title: "Angular Question", trustScore: 50 },
      ],
      contradictions: [],
      hasOfficialSource: true,
      hasCodeExample: true,
      aiRelevanceScore: 0.2,
      summary: "The provided sources do not provide a clear definition of TypeScript. They focus on Angular 2 setup.",
    });
    // Base: 40+32+14.3+10+5 = 101.3. Multiplier: 0.2/0.5 = 0.4 → 40.5. Hedging -35 → 5.5 → 6
    expect(result.score).toBe(6);
  });

  it("well-matched sources = high confidence", () => {
    const result = computeConfidence({
      citations: [
        { url: "https://react.dev", title: "React Docs", trustScore: 100 },
        { url: "https://nextjs.org/docs", title: "Next.js Docs", trustScore: 100 },
        { url: "https://github.com/facebook/react", title: "React GitHub", trustScore: 96 },
      ],
      contradictions: [],
      hasOfficialSource: true,
      hasCodeExample: true,
      aiRelevanceScore: 0.92,
      summary: "React Server Components run exclusively on the server. They can access databases directly and reduce client-side JavaScript.",
    });
    // Base: 40+24+19.7+10+5 = 98.7. Multiplier 0.92/0.5 = 1.84 → 181 → capped at 100.
    expect(result.score).toBeGreaterThanOrEqual(85);
  });
});

describe("computeConfidence — evidence/unknowns/weaknesses", () => {
  it("includes hedging weakness when detected", () => {
    const result = computeConfidence({
      citations: [{ url: "https://example.com", title: "Test", trustScore: 40 }],
      contradictions: [],
      hasOfficialSource: false,
      hasCodeExample: false,
      summary: "The sources do not provide enough information.",
    });
    expect(result.weaknesses.length).toBeGreaterThan(0);
    expect(result.weaknesses.some((w) => w.toLowerCase().includes("uncertainty"))).toBe(true);
  });

  it("includes low relevance weakness when aiRelevanceScore is low", () => {
    const result = computeConfidence({
      citations: [{ url: "https://example.com", title: "Test", trustScore: 40 }],
      contradictions: [],
      hasOfficialSource: false,
      hasCodeExample: false,
      aiRelevanceScore: 0.2,
    });
    expect(result.weaknesses.some((w) => w.toLowerCase().includes("relevance"))).toBe(true);
  });
});
