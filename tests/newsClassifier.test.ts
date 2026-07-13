import { describe, it, expect } from "vitest";
import { classifyNews } from "../src/modules/planner/newsClassifier.js";

describe("classifyNews", () => {
  it("classifies cybersecurity: hacker breach", () => {
    const result = classifyNews("latest hackers breach thousands of GitHub repositories");
    expect(result.category).toBe("cybersecurity");
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  it("classifies cybersecurity: CVE vulnerability", () => {
    const result = classifyNews("CVE-2024-1234 critical vulnerability in OpenSSL");
    expect(result.category).toBe("cybersecurity");
  });

  it("classifies cybersecurity: malware ransomware", () => {
    const result = classifyNews("new ransomware attack targets healthcare hospitals");
    expect(result.category).toBe("cybersecurity");
  });

  it("classifies cybersecurity: zero day exploit", () => {
    const result = classifyNews("zero day exploit in popular npm package");
    expect(result.category).toBe("cybersecurity");
  });

  it("classifies technology: AI startup funding", () => {
    const result = classifyNews("AI startup raises $500M in Series C funding round");
    expect(result.category).toBe("technology");
  });

  it("classifies technology: new product launch", () => {
    const result = classifyNews("Apple launches new M4 chip with AI features");
    expect(result.category).toBe("technology");
  });

  it("classifies business: stock market", () => {
    const result = classifyNews("stock market rally as Fed cuts interest rates");
    expect(result.category).toBe("business");
  });

  it("classifies science: NASA discovery", () => {
    const result = classifyNews("NASA discovers new exoplanet in habitable zone");
    expect(result.category).toBe("science");
  });

  it("classifies politics: election", () => {
    const result = classifyNews("presidential election results 2026");
    expect(result.category).toBe("politics");
  });

  it("classifies entertainment: movie release", () => {
    const result = classifyNews("new Marvel movie breaks box office records");
    expect(result.category).toBe("entertainment");
  });

  it("classifies health: vaccine approval", () => {
    const result = classifyNews("FDA approves new cancer vaccine treatment");
    expect(result.category).toBe("health");
  });

  it("returns general for ambiguous query", () => {
    const result = classifyNews("what happened today");
    expect(result.category).toBe("general");
  });

  it("returns general for empty query", () => {
    const result = classifyNews("");
    expect(result.category).toBe("general");
  });
});
