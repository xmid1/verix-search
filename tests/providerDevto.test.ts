import { describe, it, expect } from "vitest";
import { DevToProvider } from "../src/modules/providers/devto.js";

describe("DevToProvider — configuration", () => {
  const provider = new DevToProvider();

  it("has correct id and displayName", () => {
    expect(provider.id).toBe("devto");
    expect(provider.displayName).toBe("Dev.to");
  });

  it("has correct capabilities", () => {
    const caps = provider.capabilities();
    expect(caps.category).toBe("community");
    expect(caps.requiresApiKey).toBe(false);
    expect(caps.rateLimitPerMinute).toBe(30);
  });

  it("has priority 6", () => {
    expect(provider.priority).toBe(6);
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
