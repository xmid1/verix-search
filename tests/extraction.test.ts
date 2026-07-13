import { describe, it, expect } from "vitest";
import { hasExamplesScore } from "../src/modules/ranking/hasExamples.js";

describe("hasExamplesScore (extraction context)", () => {
  it("detects code blocks with language tags", () => {
    const text = [
      "Here is an example:",
      "```typescript",
      "const greeting: string = 'hello';",
      "console.log(greeting);",
      "```",
    ].join("\n");
    const score = hasExamplesScore(text);
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it("detects inline code in documentation", () => {
    const text = "The `useState` hook returns a tuple. Call `setState` to update.";
    expect(hasExamplesScore(text)).toBeGreaterThanOrEqual(0.6);
  });

  it("detects example keywords in tutorials", () => {
    const text = "For example, you can create a component like this. This tutorial shows how.";
    expect(hasExamplesScore(text)).toBeGreaterThanOrEqual(0.6);
  });

  it("returns high score for code-heavy documentation", () => {
    const text = [
      "Example 1: Basic usage",
      "```javascript",
      "const result = await fetch('https://api.example.com');",
      "const data = await result.json();",
      "```",
      "Example 2: With options",
      "```javascript",
      "const result = await fetch('https://api.example.com', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ key: 'value' })",
      "});",
      "```",
      "Example 3: Error handling",
      "```javascript",
      "try {",
      "  const result = await fetch('https://api.example.com');",
      "  console.log(await result.json());",
      "} catch (error) {",
      "  console.error('Fetch failed:', error);",
      "}",
      "```",
    ].join("\n");
    expect(hasExamplesScore(text)).toBeGreaterThanOrEqual(0.9);
  });
});
