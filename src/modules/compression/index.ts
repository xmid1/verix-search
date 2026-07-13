import { chatJSON } from "../../infra/llm.js";
import { env } from "../../config/env.js";
import type { ExtractedCodeBlock } from "../../core/types.js";

export interface CompressedContext {
  keyFacts: string[];
  examples: string[];
  warnings: string[];
  code: ExtractedCodeBlock[];
  references: string[];
}

/**
 * Context Compression Engine (spec §43): instead of shipping N full pages to
 * the caller, distill them into the facts/examples/warnings/code/references
 * an agent actually needs.
 */
export async function compressContext(
  question: string,
  documents: Array<{ url: string; title: string; markdown: string; codeBlocks: ExtractedCodeBlock[] }>
): Promise<CompressedContext> {
  const corpus = documents
    .map((d, i) => `[Source ${i + 1}] ${d.title} (${d.url})\n${d.markdown.slice(0, 3000)}`)
    .join("\n\n---\n\n");

  const distilled = await chatJSON<{ keyFacts: string[]; examples: string[]; warnings: string[] }>(
    `Question: "${question}"\n\nSources:\n${corpus}\n\n` +
      `Extract ONLY what's relevant to the question as JSON with keys: ` +
      `keyFacts (string[], concise verifiable statements), examples (string[]), warnings (string[], caveats/gotchas/deprecations). ` +
      `Be terse. Do not invent information not present in the sources.`,
    { model: env.LLM_RESEARCH_MODEL, maxTokens: 1500 }
  );

  const allCode = documents.flatMap((d) => d.codeBlocks);
  const references = documents.map((d) => d.url);

  return {
    keyFacts: distilled.keyFacts ?? [],
    examples: distilled.examples ?? [],
    warnings: distilled.warnings ?? [],
    code: allCode,
    references,
  };
}
