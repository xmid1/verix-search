import { describe, it, expect } from "vitest";
import { expandEntities } from "../src/modules/planner/entityExpander.js";

describe("expandEntities", () => {
  it("expands AI coding agent query", () => {
    const result = expandEntities("build autonomous coding agent with memory tools planning execution self correction");
    expect(result).not.toBeNull();
    expect(result!.entities).toContain("OpenHands");
    expect(result!.entities).toContain("SWE-agent");
    expect(result!.entities).toContain("AutoGPT");
    expect(result!.expandedQueries.length).toBeGreaterThan(0);
    expect(result!.expandedQueries[0]).toContain("SWE-agent");
    expect(result!.preferredSources).toContain("arxiv");
    expect(result!.preferredSources).toContain("github");
    expect(result!.excludeSources).toContain("mdn");
    expect(result!.excludeSources).toContain("devto");
  });

  it("expands SWE-agent query", () => {
    const result = expandEntities("what is SWE-agent and how does it work");
    expect(result).not.toBeNull();
    expect(result!.entities).toContain("OpenHands");
    expect(result!.entities).toContain("SWE-agent");
  });

  it("expands cybersecurity competition query", () => {
    const result = expandEntities("who won the latest cybersecurity competition");
    expect(result).not.toBeNull();
    expect(result!.entities).toContain("CTF");
    expect(result!.entities).toContain("DEF CON");
    expect(result!.preferredSources).toContain("googlenews");
  });

  it("expands CTF query", () => {
    const result = expandEntities("best CTF competitions 2026");
    expect(result).not.toBeNull();
    expect(result!.entities).toContain("CTF");
  });

  it("returns null for general query", () => {
    const result = expandEntities("how to cook pasta");
    expect(result).toBeNull();
  });
});
