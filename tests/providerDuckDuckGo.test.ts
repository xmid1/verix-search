import { describe, it, expect } from "vitest";
import { DuckDuckGoProvider } from "../src/modules/providers/duckduckgo.js";

describe("DuckDuckGoProvider — configuration", () => {
  const provider = new DuckDuckGoProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("duckduckgo");
    expect(provider.displayName).toBe("DuckDuckGo");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("general");
    expect(caps.requiresApiKey).toBe(false);
    expect(caps.rateLimitPerMinute).toBe(60);
  });

  it("has priority 7", () => {
    expect(provider.priority).toBe(7);
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
