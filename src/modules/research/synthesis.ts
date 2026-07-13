import { chatJSON } from "../../infra/llm.js";
import { env } from "../../config/env.js";
import type { ExtractedCodeBlock } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";

const logger = childLogger({ module: "research:synthesis" });

export interface SynthesisInput {
  question: string;
  sources: Array<{ url: string; title: string; trustScore: number; markdown: string }>;
}

export interface SynthesisOutput {
  summary: string;
  keyFacts: string[];
  examples: string[];
  warnings: string[];
}

/**
 * Final synthesis step of the research pipeline — combines every extracted
 * source into one evidence-based answer. Every factual claim must be
 * traceable to the source corpus provided; the prompt explicitly forbids
 * inventing information not present in the sources.
 */
export async function synthesizeAnswer(input: SynthesisInput): Promise<SynthesisOutput> {
  const corpus = input.sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.url}, trust=${s.trustScore})\n${s.markdown.slice(0, 2500)}`)
    .join("\n\n---\n\n");

  try {
    const result = await chatJSON<SynthesisOutput>(
      `You are Verix's research synthesizer. Question: "${input.question}"\n\nSources:\n${corpus}\n\n` +
        `Write a thorough, accurate answer using ONLY the information in the sources above. ` +
        `Return JSON: { summary (markdown string, cite sources inline as [1], [2]...), ` +
        `keyFacts (string[]), examples (string[]), warnings (string[], caveats/deprecations/edge-cases) }. ` +
        `If sources disagree or are insufficient, say so plainly in the summary rather than guessing.`,
      { model: env.LLM_RESEARCH_MODEL, maxTokens: 2000 }
    );
    return {
      summary: result.summary ?? "",
      keyFacts: result.keyFacts ?? [],
      examples: result.examples ?? [],
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    logger.error({ err }, "synthesis failed");
    throw new Error("Failed to synthesize a research answer from the collected sources");
  }
}

export function collectCodeSnippets(sources: Array<{ codeBlocks: ExtractedCodeBlock[] }>): ExtractedCodeBlock[] {
  return sources.flatMap((s) => s.codeBlocks).slice(0, 20);
}
