import { describe, it, expect } from "vitest";
import { extractCodeBlocks } from "../src/modules/extraction/codeExtractor.js";

describe("extractCodeBlocks — fenced code blocks", () => {
  it("extracts simple fenced code block", () => {
    const md = "Some text\n\n```rust\nfn main() {\n    println!(\"hello\");\n}\n```\n\nMore text";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("rust");
    expect(blocks[0]!.code).toContain("fn main()");
  });

  it("extracts multiple fenced code blocks", () => {
    const md = "```ts\nconst x = 1;\n```\n\n```python\nprint('hello')\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.language).toBe("ts");
    expect(blocks[1]!.language).toBe("python");
  });

  it("handles fenced code blocks without language tag", () => {
    const md = "```\nplain code block\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("text");
  });

  it("handles tilde fences", () => {
    const md = "~~~typescript\nconst msg: string = \"hello\";\n~~~";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("typescript");
  });
});

describe("extractCodeBlocks — indented code blocks (Wikipedia-style)", () => {
  it("extracts indented code blocks (4 spaces)", () => {
    const md = "Some explanation:\n\n    fn main() {\n        println!(\"hello\");\n    }\n\nMore text";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    // The indented block might have "text" language and content
    const indentedBlock = blocks.find((b) => b.code.includes("fn main()"));
    expect(indentedBlock).toBeDefined();
  });

  it("extracts multiple indented code blocks", () => {
    const md = "First:\n\n    console.log(\"hello\");\n\nSecond:\n\n    const x = 1;\n    console.log(x);\n";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts tab-indented code blocks", () => {
    const md = "Example:\n\n\tconst greeting = \"hello\";\n\tconsole.log(greeting);\n";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    const block = blocks.find((b) => b.code.includes("greeting"));
    expect(block).toBeDefined();
  });

  it("does not duplicate indented blocks that overlap with fenced blocks", () => {
    const md = "```rust\nfn main() {}\n```\n\n    fn main() {}\n";
    const blocks = extractCodeBlocks(md);
    const rustBlocks = blocks.filter((b) => b.code.includes("fn main()"));
    // Should not have duplicates of the same content
    expect(rustBlocks.length).toBe(1);
  });
});

describe("extractCodeBlocks — mixed content", () => {
  it("extracts both fenced and indented blocks", () => {
    const md = "```rust\nlet x = 1;\n```\n\nSimple:\n\n    println!(\"hello\");\n";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for markdown without code", () => {
    const md = "This is just plain text without any code blocks.";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(0);
  });
});

describe("extractCodeBlocks — kind classification", () => {
  it("classifies short blocks as example in tutorial-like docs", () => {
    const md = "```ts\nconst x = 1;\n```\n\n```ts\nconsole.log(x);\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(2);
    // Short document (< 2000 words) with short blocks → example
    expect(blocks.every((b) => b.kind === "example")).toBe(true);
  });

  it("detects Rust code language by keyword heuristics", () => {
    const md = "```\nfn main() {\n    println!(\"Hello, world!\");\n    let mut x = 42;\n    x += 1;\n    println!(\"{}\", x);\n}\n```\n\n```\nimpl Calculator {\n    fn add(a: i32, b: i32) -> i32 {\n        a + b\n    }\n}\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.language).toBe("rust");
    expect(blocks[1]!.language).toBe("rust");
  });

  it("detects JavaScript code language by keyword heuristics", () => {
    const md = "```\nfunction greet(name) {\n    return `Hello, ${name}!`;\n}\n\nconst result = greet(\"world\");\nconsole.log(result);\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("javascript");
  });

  it("detects Python code language by keyword heuristics", () => {
    const md = "```\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n\nresult = fibonacci(10)\nprint(result)\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("python");
  });

  it("preserves explicit language tag from fence", () => {
    const md = "```rust\nfn main() {}\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks[0]!.language).toBe("rust");
  });

  it("detects shell/bash code language", () => {
    const md = "```\n#!/bin/bash\necho \"Hello\"\ncurl -X GET https://example.com\ngrep \"pattern\" file.txt\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("bash");
  });

  it("returns 'text' for short ambiguous code without distinctive keywords", () => {
    const md = "```\nfoo bar baz\nqux\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("text");
  });

  it("detects language for indented code blocks (Wikipedia-style)", () => {
    const md = "Some text about Rust:\n\n    fn main() {\n        println!(\"hello\");\n        let x = 1;\n    }\n\nMore text.";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.language).toBe("rust");
  });

  it("classifies 80+ line blocks as production", () => {
    const lines = Array.from({ length: 85 }, (_, i) => `line ${i}`).join("\n");
    const md = "```ts\n" + lines + "\n```";
    const blocks = extractCodeBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.kind).toBe("production");
  });
});
