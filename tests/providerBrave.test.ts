import { describe, it, expect } from "vitest";
import { BraveProvider } from "../src/modules/providers/brave.js";

describe("BraveProvider — configuration", () => {
  const provider = new BraveProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("brave");
    expect(provider.displayName).toBe("Brave Search");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("general");
    expect(caps.requiresApiKey).toBe(true);
    expect(caps.rateLimitPerMinute).toBe(15);
  });

  it("returns empty array for empty query", async () => {
    const results = await provider.search({
      raw: "",
      traceId: "test",
    });
    expect(results).toEqual([]);
  });

  it("returns empty when no API key configured", async () => {
    const results = await provider.search({
      raw: "test query",
      traceId: "test",
    });
    expect(results).toEqual([]);
  });

  it("health returns false when no API key", async () => {
    const healthy = await provider.health();
    expect(healthy).toBe(false);
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
