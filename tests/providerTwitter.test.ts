import { describe, it, expect } from "vitest";
import { TwitterProvider } from "../src/modules/providers/twitter.js";

describe("TwitterProvider — configuration", () => {
  const provider = new TwitterProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("twitter");
    expect(provider.displayName).toBe("Twitter / X");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("community");
    expect(caps.requiresApiKey).toBe(true);
    expect(caps.rateLimitPerMinute).toBe(30);
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
