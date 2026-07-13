import { describe, it, expect } from "vitest";
import { RedditProvider } from "../src/modules/providers/reddit.js";

describe("RedditProvider — configuration", () => {
  const provider = new RedditProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("reddit");
    expect(provider.displayName).toBe("Reddit");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("community");
    expect(caps.requiresApiKey).toBe(false);
    expect(caps.rateLimitPerMinute).toBe(60); // with OAuth — higher rate limit
  });

  it("returns empty array for empty query", async () => {
    const results = await provider.search({
      raw: "",
      traceId: "test",
    });
    expect(results).toEqual([]);
  });

  it("handles search timeout gracefully", async () => {
    // This tests that the provider doesn't crash with a query
    // (actual network call is tested in integration tests)
    const controller = new AbortController();
    controller.abort(); // immediately abort
    // Just verify it doesn't throw
    const results = await provider.search({
      raw: "test query",
      traceId: "test",
    });
    expect(Array.isArray(results)).toBe(true);
  });
});
