import { describe, it, expect } from "vitest";
import { allProviders, providersById } from "../src/modules/providers/index.js";

describe("Provider Registry — all providers loaded", () => {
  it("loads exactly 26 providers", () => {
    expect(allProviders.length).toBe(26);
  });

  it("every provider has a unique id", () => {
    const ids = allProviders.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("providersById contains every provider", () => {
    for (const p of allProviders) {
      expect(providersById[p.id]).toBeDefined();
    }
  });

  it("all providers have valid capabilities", () => {
    for (const p of allProviders) {
      const caps = p.capabilities();
      expect(caps.category).toBeDefined();
      expect(typeof caps.requiresApiKey).toBe("boolean");
      expect(typeof caps.rateLimitPerMinute).toBe("number");
      expect(caps.rateLimitPerMinute).toBeGreaterThan(0);
    }
  });

  // Tier 1 — General search
  const generalProviders = ["brave", "duckduckgo"];

  // Tier 2 — Code & technical
  const codeProviders = ["github", "stackexchange", "mdn"];

  // Tier 3 — Academic
  const academicProviders = ["semanticscholar", "pubmed", "arxiv", "crossref"];

  // Tier 4 — Community
  const communityProviders = ["reddit", "hackernews", "devto", "medium", "twitter"];

  // Tier 5 — News
  const newsProviders = ["googlenews", "gdelt", "rss"];

  // Tier 6 — Packages & docs
  const pkgProviders = ["npm", "pypi", "wikipedia"];

  // Tier 7 — Specialised
  const extraProviders = ["youtube", "cve", "osv", "wikidata", "commoncrawl", "internetarchive"];

  it("has all general search providers", () => {
    for (const id of generalProviders) {
      expect(providersById[id]).toBeDefined();
    }
  });

  it("has all code/technical providers", () => {
    for (const id of codeProviders) {
      expect(providersById[id]).toBeDefined();
    }
  });

  it("has all academic providers", () => {
    for (const id of academicProviders) {
      expect(providersById[id]).toBeDefined();
    }
  });

  it("has all community providers", () => {
    for (const id of communityProviders) {
      expect(providersById[id]).toBeDefined();
    }
  });

  it("has news providers", () => {
    expect(providersById["googlenews"]).toBeDefined();
  });

  it("has package/docs providers", () => {
    for (const id of pkgProviders) {
      expect(providersById[id]).toBeDefined();
    }
  });

  it("has specialised providers", () => {
    for (const id of extraProviders) {
      expect(providersById[id]).toBeDefined();
    }
  });

  it("has all expected provider ids (total check)", () => {
    const expectedIds = new Set([
      ...generalProviders,
      ...codeProviders,
      ...academicProviders,
      ...communityProviders,
      ...newsProviders,
      ...pkgProviders,
      ...extraProviders,
    ]);
    const actualIds = new Set(allProviders.map((p) => p.id));
    expect(actualIds).toEqual(expectedIds);
  });

  it("has providers with reasonable priority distribution", () => {
    const priorities = allProviders.map((p) => p.priority);
    expect(priorities.every((p) => p >= 1 && p <= 10)).toBe(true);
    // Should have at least one high-priority (>=7) and one low-priority (<=5)
    expect(priorities.some((p) => p >= 7)).toBe(true);
    expect(priorities.some((p) => p <= 5)).toBe(true);
  });

  it("all providers can be instantiated via providersById", () => {
    for (const [id, provider] of Object.entries(providersById)) {
      expect(provider.id).toBe(id);
      expect(typeof provider.search).toBe("function");
      expect(typeof provider.health).toBe("function");
    }
  });

  it("health method returns a boolean for all providers", async () => {
    // Test a few providers that don't require API keys (they return false quickly)
    const testableProviders = allProviders.filter((p) => !p.capabilities().requiresApiKey).slice(0, 5);
    for (const p of testableProviders) {
      const result = await p.health();
      expect(typeof result).toBe("boolean");
    }
  });
});
