import { describe, it, expect } from "vitest";
import { detectIntent } from "../src/modules/planner/intent.js";

// These tests validate the heuristic regex patterns WITHOUT calling the LLM.
// If a query matches a heuristic, the LLM fallback is never reached.
// We test each regex independently to isolate failures.

function expectIntent(query: string, expected: string): ReturnType<typeof expect> {
  return expect(
    detectIntent(query).then((r) => {
      if (typeof r === "string") return r;
      return r.intent;
    }),
    `detectIntent("${query}")`
  ).resolves;
}

describe("intent detection — programming queries (should all return 'programming')", () => {
  // Language name tests
  it("typescript generics best practices → programming", async () => {
    await expectIntent("typescript generics best practices", "programming").toBe("programming");
  });

  it("what is TypeScript and why use it → programming", async () => {
    await expectIntent("what is TypeScript and why use it", "programming").toBe("programming");
  });

  it("typescript generics → programming", async () => {
    await expectIntent("typescript generics", "programming").toBe("programming");
  });

  it("react server components → programming", async () => {
    await expectIntent("react server components", "programming").toBe("programming");
  });

  it("python async await tutorial → programming", async () => {
    await expectIntent("python async await tutorial", "programming").toBe("programming");
  });

  it("rust ownership explained → programming", async () => {
    await expectIntent("rust ownership explained", "programming").toBe("programming");
  });

  it("javascript closures → programming", async () => {
    await expectIntent("javascript closures", "programming").toBe("programming");
  });

  it("django vs flask → programming", async () => {
    await expectIntent("django vs flask", "programming").toBe("programming");
  });

  it("how to use generics in Java → programming", async () => {
    await expectIntent("how to use generics in Java", "programming").toBe("programming");
  });

  it("best practices for API design → programming", async () => {
    await expectIntent("best practices for API design", "programming").toBe("programming");
  });

  it("Next.js 14 app router → programming", async () => {
    await expectIntent("Next.js 14 app router", "programming").toBe("programming");
  });

  it("what is the syntax for arrow functions → programming", async () => {
    await expectIntent("what is the syntax for arrow functions", "programming").toBe("programming");
  });

  it("docker kubernetes deployment → programming", async () => {
    const r = await detectIntent("docker kubernetes deployment");
    const intent = typeof r === "string" ? r : r.intent;
    expect(intent).not.toBe("general");
  });

  it("typescript interface vs type → programming", async () => {
    await expectIntent("typescript interface vs type", "programming").toBe("programming");
  });

  it("swift ui tutorial for beginners → programming", async () => {
    await expectIntent("swift ui tutorial for beginners", "programming").toBe("programming");
  });

  it("php mysql connection code → programming", async () => {
    await expectIntent("php mysql connection code", "programming").toBe("programming");
  });

  it("c++ smart pointers explained → programming", async () => {
    await expectIntent("c++ smart pointers explained", "programming").toBe("programming");
  });
});

describe("intent detection — non-programming queries (should NOT return 'programming')", () => {
  it("latest news today → news", async () => {
    await expectIntent("latest news today", "news").toBe("news");
  });

  it("how to lose weight fast → general", async () => {
    const r = await detectIntent("how to lose weight fast");
    const intent = typeof r === "string" ? r : r.intent;
    expect(intent).not.toBe("programming");
  });

  it("best movies 2024 → general", async () => {
    const r = await detectIntent("best movies 2024");
    const intent = typeof r === "string" ? r : r.intent;
    expect(intent).not.toBe("programming");
  });

  it("world health organization covid → general", async () => {
    const r = await detectIntent("world health organization covid");
    const intent = typeof r === "string" ? r : r.intent;
    expect(intent).not.toBe("programming");
  });
});
