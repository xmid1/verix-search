import { describe, it, expect } from "vitest";
import { extractLinks, extractSitemapUrls } from "../src/modules/extraction/crawler.js";

describe("Crawler — extractLinks", () => {
  it("extracts markdown links", () => {
    const markdown = `Here is a [link](https://example.com/page) and [another](https://test.org/doc)`;
    const links = extractLinks(markdown, "https://example.com");
    expect(links).toEqual(["https://example.com/page", "https://test.org/doc"]);
  });

  it("returns empty array for text without links", () => {
    const markdown = "Just plain text with no links";
    const links = extractLinks(markdown, "https://example.com");
    expect(links).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractLinks("", "https://example.com")).toEqual([]);
  });

  it("extracts only http/https links", () => {
    const markdown = `[valid](https://example.com/page) [skip](ftp://bad.com) [also](http://ok.com/path)`;
    const links = extractLinks(markdown, "https://example.com");
    expect(links).toEqual(["https://example.com/page", "http://ok.com/path"]);
  });

  it("handles links with paths and query strings", () => {
    const markdown = `[doc](https://example.com/docs?q=hello&p=1#section)`;
    const links = extractLinks(markdown, "https://example.com");
    expect(links).toEqual(["https://example.com/docs?q=hello&p=1#section"]);
  });

  it("returns all occurrences of the same URL", () => {
    const markdown = `[a](https://example.com/page) [b](https://example.com/page) [c](https://example.com/page)`;
    const links = extractLinks(markdown, "https://example.com");
    expect(links).toHaveLength(3);
    expect(links.every((l) => l === "https://example.com/page")).toBe(true);
  });
});

describe("Crawler — extractSitemapUrls", () => {
  it("returns empty array for unreachable domain", async () => {
    const urls = await extractSitemapUrls("https://this-domain-definitely-does-not-exist-12345.com");
    expect(Array.isArray(urls)).toBe(true);
    // Should be empty since the domain doesn't exist
    expect(urls.length).toBe(0);
  });

  it("handles invalid URLs gracefully", async () => {
    const urls = await extractSitemapUrls("not-a-url");
    expect(Array.isArray(urls)).toBe(true);
    expect(urls.length).toBe(0);
  });
});
