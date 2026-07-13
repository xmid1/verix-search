import { chatJSON } from "../../infra/llm.js";
import { env } from "../../config/env.js";
import { extractDocument } from "../extraction/index.js";
import type { CitationVerification, Verdict } from "../../core/types.js";

export async function verifyClaim(claim: string, sourceUrl: string): Promise<CitationVerification> {
  let doc;
  try {
    doc = await extractDocument(sourceUrl);
  } catch {
    return {
      claim,
      sourceUrl,
      verdict: "source_unreachable",
      confidence: 0,
      evidence: "Could not fetch or extract content from the provided URL",
      evidenceVerified: false,
    };
  }

  const sourceText = doc.markdown.slice(0, 8000);

  const prompt = `You are a citation verification system. Determine how the provided source relates to the given claim.

Claim: "${claim}"
Source URL: ${sourceUrl}

Source content:
${sourceText}

Respond with JSON:
{
  "verdict": "supported" | "contradicted" | "partially_supported" | "not_addressed",
  "confidence": number (0-100),
  "evidence": "EXACT verbatim quote from the source that best supports or refutes the claim (MUST be an exact substring of the source content above)",
  "contradictoryQuote": "EXACT verbatim quote that contradicts (null if none)"
}

Verdict definitions:
- "supported": The source explicitly and clearly supports the claim with direct evidence
- "contradicted": The source explicitly contradicts the claim
- "partially_supported": The source supports part of the claim but not all of it, or the evidence is indirect/incomplete
- "not_addressed": The source does not mention the claim or topic at all

Rules:
- "evidence" MUST be an EXACT verbatim quote from the source content above. Do not paraphrase or fabricate.
- If multiple quotes exist, choose the most directly relevant one.
- If no exact quote supports the verdict, use "not_addressed" as verdict.
- Be conservative: if uncertain between supported and partially_supported, choose partially_supported.`;

  const result = await chatJSON<{
    verdict: Verdict;
    confidence: number;
    evidence: string;
    contradictoryQuote: string | null;
  }>(prompt, { model: env.LLM_RESEARCH_MODEL, maxTokens: 1000, temperature: 0 });

  const evidenceVerified = sourceText.includes(result.evidence);

  if (!evidenceVerified && result.verdict !== "not_addressed" && result.verdict !== "source_unreachable") {
    result.evidence = `[LLM-suggested evidence not verified in source text] ${result.evidence}`;
  }

  return {
    claim,
    sourceUrl,
    verdict: result.verdict ?? "not_addressed",
    confidence: result.verdict === "not_addressed" ? 0 : result.confidence,
    evidence: result.evidence ?? "",
    evidenceVerified,
    contradictoryQuote: result.contradictoryQuote ?? undefined,
  };
}
