import { describe, it, expect } from "vitest";
import { MediumProvider } from "../src/modules/providers/medium.js";

describe("MediumProvider — configuration", () => {
  const provider = new MediumProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("medium");
    expect(provider.displayName).toBe("Medium");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("community");
    expect(caps.requiresApiKey).toBe(false);
    expect(caps.rateLimitPerMinute).toBe(20);
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
