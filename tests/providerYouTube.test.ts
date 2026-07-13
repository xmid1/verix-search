import { describe, it, expect } from "vitest";
import { YouTubeProvider } from "../src/modules/providers/youtube.js";

describe("YouTubeProvider — configuration", () => {
  const provider = new YouTubeProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("youtube");
    expect(provider.displayName).toBe("YouTube");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("general");
    expect(caps.requiresApiKey).toBe(false);
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
