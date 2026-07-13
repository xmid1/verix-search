import { describe, it, expect } from "vitest";
import { spamPenalty } from "../src/modules/ranking/spam.js";

describe("spamPenalty — trusted domain exemption", () => {
  it("returns high penalty for untrusted domain with keyword stuffing", () => {
    const text = "buy buy buy cheap cheap cheap cheap cheap cheap cheap cheap cheap money money money money money money fast fast fast fast fast fast limited offer";
    const penalty = spamPenalty(text);
    expect(penalty).toBeGreaterThan(30);
  });

  it("returns 0 for empty text", () => {
    expect(spamPenalty("")).toBe(0);
    expect(spamPenalty("   ")).toBe(0);
  });

  it("reduces penalty by 90% for trusted domains (trustScore ≥ 80)", () => {
    const text = "buy buy buy cheap cheap cheap cheap cheap cheap cheap cheap cheap money money money money money money fast fast fast fast fast fast limited offer";
    const withoutTrust = spamPenalty(text);
    const withTrust = spamPenalty(text, 99);
    expect(withTrust).toBeLessThanOrEqual(Math.round(withoutTrust * 0.1) + 1);
  });

  it("reduces penalty by 50% for news intent", () => {
    const text = "Hackers breach thousands of GitHub repositories in latest cybersecurity incident";
    const normal = spamPenalty(text);
    const news = spamPenalty(text, undefined, "news");
    expect(news).toBeLessThanOrEqual(Math.round(normal * 0.5));
  });

  it("exempts MDN-like technical docs from spam penalty", () => {
    const docText = "React components are the building blocks of React applications. Components let you split the UI into independent, reusable pieces. React components accept inputs called props and return React elements. React renders components in the browser. Components can be class components or function components. React components manage their own state and lifecycle.";
    const penalty = spamPenalty(docText, 99);
    expect(penalty).toBeLessThan(15);
  });

  it("normal penalty without trust score is higher for repetitive content", () => {
    const docText = "React React React React React components components components components components elements elements elements elements elements props props props props props render render render render render";
    const penaltyWithoutTrust = spamPenalty(docText);
    const penaltyWithTrust = spamPenalty(docText, 99);
    expect(penaltyWithTrust).toBeLessThan(penaltyWithoutTrust);
  });

  it("short text gets 0 penalty", () => {
    expect(spamPenalty("Hello world", 99)).toBe(0);
    expect(spamPenalty("Hello world")).toBe(0);
  });
});
