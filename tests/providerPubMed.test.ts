import { describe, it, expect } from "vitest";
import { PubMedProvider } from "../src/modules/providers/pubmed.js";

describe("PubMedProvider — configuration", () => {
  const provider = new PubMedProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("pubmed");
    expect(provider.displayName).toBe("PubMed");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("academic");
    expect(caps.requiresApiKey).toBe(false);
    expect(caps.rateLimitPerMinute).toBe(180);
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
