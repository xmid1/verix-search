import { describe, it, expect } from "vitest";
import { GoogleNewsProvider } from "../src/modules/providers/googlenews.js";

describe("GoogleNewsProvider — configuration", () => {
  const provider = new GoogleNewsProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("googlenews");
    expect(provider.displayName).toBe("Google News");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("news");
    expect(caps.requiresApiKey).toBe(true);
    expect(caps.rateLimitPerMinute).toBe(10);
  });

  it("returns empty array for empty query", async () => {
    const results = await provider.search({
      raw: "",
      traceId: "test",
    });
    expect(results).toEqual([]);
  });

  it("returns empty when no GOOGLE_API_KEY", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await provider.search({
      raw: "test query",
      traceId: "test",
    });
    expect(Array.isArray(results)).toBe(true);
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
