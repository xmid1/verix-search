import { describe, it, expect } from "vitest";

describe("environment configuration", () => {
  it("env exports are defined", async () => {
    // Dynamic import to ensure env module loads
    const { env } = await import("../src/config/env.js");
    expect(env).toBeDefined();
    expect(env.NODE_ENV).toBe("test");
    expect(typeof env.PORT).toBe("number");
    expect(typeof env.SEARCH_TIMEOUT_MS).toBe("number");
  });
});
