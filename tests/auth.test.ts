import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "../src/modules/auth/apiKey.js";
import { hasScope, type Scope } from "../src/modules/auth/rbac.js";

describe("generateApiKey", () => {
  it("generates a key with vx_live_ prefix", () => {
    const key = generateApiKey();
    expect(key.plaintext.startsWith("vx_live_")).toBe(true);
  });

  it("includes a 16-char prefix", () => {
    const key = generateApiKey();
    expect(key.prefix.length).toBe(16);
  });

  it("generates a valid SHA-256 hash", () => {
    const key = generateApiKey();
    expect(key.hash).toBe(hashApiKey(key.plaintext));
  });

  it("generates unique keys each time", () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1.plaintext).not.toBe(key2.plaintext);
  });
});

describe("hashApiKey", () => {
  it("produces a 64-char hex string", () => {
    const hash = hashApiKey("vx_live_test123");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashApiKey("test-key")).toBe(hashApiKey("test-key"));
  });
});

describe("hasScope", () => {
  const scopes: Scope[] = ["search", "research"];

  it("returns true for matching scope", () => {
    expect(hasScope(scopes, "search")).toBe(true);
  });

  it("returns false for missing scope", () => {
    expect(hasScope(scopes, "extraction" as Scope)).toBe(false);
  });

  it("returns true for admin scope regardless", () => {
    expect(hasScope([...scopes, "admin"], "extraction" as Scope)).toBe(true);
  });

  it("returns false for empty scopes", () => {
    expect(hasScope([], "search")).toBe(false);
  });
});
