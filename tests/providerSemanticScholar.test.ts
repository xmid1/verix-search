import { describe, it, expect } from "vitest";
import { SemanticScholarProvider } from "../src/modules/providers/semanticscholar.js";

describe("SemanticScholarProvider — configuration", () => {
  const provider = new SemanticScholarProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("semanticscholar");
    expect(provider.displayName).toBe("Semantic Scholar");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("academic");
    expect(caps.requiresApiKey).toBe(false);
    expect(caps.rateLimitPerMinute).toBe(10);
  });

  it("has priority 8", () => {
    expect(provider.priority).toBe(8);
  });

  it("returns empty array for empty query", async () => {
    const results = await provider.search({
      raw: "",
      traceId: "test",
    });
    expect(results).toEqual([]);
  });

  it("handles search gracefully", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await provider.search({
      raw: "test query",
      traceId: "test",
    });
    expect(Array.isArray(results)).toBe(true);
  });
});
