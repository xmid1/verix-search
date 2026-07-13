import type { Citation, RankedResult, ExtractedDocument } from "../../core/types.js";

/**
 * Citation Engine (spec §40/54): every piece of surfaced information carries
 * a source, trust score, and (when available) author/date — never a bare fact.
 */
export function citationFromResult(result: RankedResult, extracted?: ExtractedDocument): Citation {
  return {
    url: result.url,
    title: extracted?.title ?? result.title,
    author: extracted?.author,
    publishedAt: extracted?.publishedAt ?? result.publishedAt,
    provider: result.provider,
    trustScore: result.signals.trust,
    snippet: result.snippet ?? extracted?.markdown.slice(0, 240),
  };
}

export function buildCitations(results: RankedResult[], extractedByUrl: Map<string, ExtractedDocument>): Citation[] {
  return results.map((r) => citationFromResult(r, extractedByUrl.get(r.url)));
}
