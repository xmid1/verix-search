import { describe, it, expect } from "vitest";
import { selectProviders } from "../src/modules/planner/providerSelection.js";
import { providersById } from "../src/modules/providers/index.js";

describe("selectProviders — keyword-based routing", () => {
  it("injects YouTube provider when query contains 'youtube'", () => {
    const providers = selectProviders("programming", "best react hooks explained youtube");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("youtube");
  });

  it("injects YouTube provider when query contains 'video'", () => {
    const providers = selectProviders("programming", "react hooks video tutorial");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("youtube");
  });

  it("injects Reddit provider when query contains 'reddit'", () => {
    const providers = selectProviders("general", "typescript vs javascript reddit");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("reddit");
  });

  it("injects GitHub provider when query contains 'github'", () => {
    const providers = selectProviders("general", "github verix search");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("github");
  });

  it("injects arXiv provider when query contains 'arxiv'", () => {
    const providers = selectProviders("general", "transformer architecture arxiv");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("arxiv");
  });

  it("injects multiple keyword providers simultaneously", () => {
    const providers = selectProviders("programming", "youtube reddit react hooks");
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("youtube");
    expect(ids).toContain("reddit");
  });

  it("keyword providers appear at the front of the list (high priority)", () => {
    const providers = selectProviders("programming", "best react hooks explained youtube");
    const ids = providers.map((p) => p.id);
    // YouTube should be first (injected at front)
    expect(ids[0]).toBe("youtube");
  });

  it("works without rawQuery (backward compat)", () => {
    const providers = selectProviders("general");
    expect(providers.length).toBeGreaterThan(0);
  });
});
