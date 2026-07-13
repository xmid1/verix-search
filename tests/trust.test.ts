import { describe, it, expect } from "vitest";
import { trustScore } from "../src/modules/ranking/trust.js";

describe("trustScore with www.prefix stripping", () => {
  // These are the core bug: www. prefix causes hostname mismatch
  it("typescriptlang.org (without www) → 100", () => {
    expect(trustScore("https://typescriptlang.org/docs/handbook/2/generics.html")).toBe(100);
  });

  it("www.typescriptlang.org (with www) → 100", () => {
    expect(trustScore("https://www.typescriptlang.org/docs/handbook/2/generics.html")).toBe(100);
  });

  it("developer.mozilla.org → 99", () => {
    expect(trustScore("https://developer.mozilla.org/en-US/docs/Web/JavaScript")).toBe(99);
  });

  it("www.developer.mozilla.org → 99", () => {
    expect(trustScore("https://www.developer.mozilla.org/en-US/docs/Web/JavaScript")).toBe(99);
  });

  it("docs.python.org → 100", () => {
    expect(trustScore("https://docs.python.org/3/tutorial/")).toBe(100);
  });

  it("react.dev → 100", () => {
    expect(trustScore("https://react.dev/learn")).toBe(100);
  });

  it("www.react.dev → 100", () => {
    expect(trustScore("https://www.react.dev/learn")).toBe(100);
  });

  it("github.com → 96", () => {
    expect(trustScore("https://github.com/microsoft/TypeScript")).toBe(96);
  });

  it("www.github.com → 96", () => {
    expect(trustScore("https://www.github.com/microsoft/TypeScript")).toBe(96);
  });

  it("nodejs.org → 100", () => {
    expect(trustScore("https://nodejs.org/en/docs/")).toBe(100);
  });

  it("www.nodejs.org → 100", () => {
    expect(trustScore("https://www.nodejs.org/en/docs/")).toBe(100);
  });

  it("nextjs.org → 100", () => {
    expect(trustScore("https://nextjs.org/docs/app/api-reference")).toBe(100);
  });

  it("www.nextjs.org → 100", () => {
    expect(trustScore("https://www.nextjs.org/docs")).toBe(100);
  });

  it("rust-lang.org → 100 (via doc.rust-lang.org exact match)", () => {
    expect(trustScore("https://doc.rust-lang.org/book/")).toBe(100);
  });

  it("deno.land → 100", () => {
    expect(trustScore("https://deno.land/manual")).toBe(100);
  });

  it("kubernetes.io → 100", () => {
    expect(trustScore("https://kubernetes.io/docs/home/")).toBe(100);
  });

  it("www.kubernetes.io → 100", () => {
    expect(trustScore("https://www.kubernetes.io/docs/home/")).toBe(100);
  });

  it("learn.microsoft.com → 98", () => {
    expect(trustScore("https://learn.microsoft.com/en-us/dotnet/")).toBe(98);
  });

  it("www.learn.microsoft.com → 98", () => {
    expect(trustScore("https://www.learn.microsoft.com/en-us/dotnet/")).toBe(98);
  });

  it("blog.example.com → 40 (unknown domain)", () => {
    expect(trustScore("https://blog.example.com/typescript")).toBe(40);
  });

  it("rfc-editor.org → 98", () => {
    expect(trustScore("https://rfc-editor.org/rfc/rfc9110")).toBe(98);
  });

  it("stackoverflow.com → 40 (not in list)", () => {
    // Note: stackoverflow.com isn't in the exact list, so it defaults to 40
    expect(trustScore("https://stackoverflow.com/questions/123")).toBe(40);
  });

  it(".edu suffix → 95", () => {
    expect(trustScore("https://cs.mit.edu/research")).toBe(95);
    expect(trustScore("https://www.stanford.edu/research")).toBe(95);
    expect(trustScore("https://www.cs.mit.edu/research")).toBe(95);
  });
});
