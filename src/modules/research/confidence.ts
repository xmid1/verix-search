import type { ConfidenceReport, Contradiction, Citation } from "../../core/types.js";

const HEDGING_PATTERNS: RegExp[] = [
  /\bdo(?:es)? not provide\b/i,
  /\bdoes not offer\b/i,
  /\bno clear\b/i,
  /\bnot clear\b/i,
  /\bnot explicitly\b/i,
  /\blimited information\b/i,
  /\bunable to determine\b/i,
  /\bcannot determine\b/i,
  /\binsufficient\b/i,
  /\bno direct\b/i,
  /\bnot directly\b/i,
  /\bdoes not contain\b/i,
  /\bno evidence\b/i,
  /\bdid not find\b/i,
  /\bcould not find\b/i,
  /\bnot enough\b/i,
  /\bno relevant\b/i,
  /\bis not mentioned\b/i,
  /\bare not mentioned\b/i,
  /\bsources do not\b/i,
  /\bno information\b/i,
  /\bdoes not address\b/i,
  /\bno concrete\b/i,
  /\bdoes not specif(y|ied)\b/i,
];

/**
 * Confidence Engine (spec §65) + Self-Evaluation (spec §46).
 *
 * Formula (implemented exactly as below):
 *   base = 40
 *        + min(sourceCount × 8, 32)         // up to +32 for source diversity
 *        + (avgTrust / 100) × 20             // up to +20 for mean domain trust
 *        + (hasOfficialSource ? 10 : 0)      // any citation with trustScore ≥ 95
 *        + (hasCodeExample ? 5 : 0)
 *        - unresolvedContradictions × 12
 *
 *   if aiRelevanceScore is defined:
 *       base = base × (aiRelevanceScore / 0.5)   // multiplier, not additive
 *
 *   if summary contains any hedging phrase:
 *       base = base - 35                           // flat penalty
 *
 *   score = clamp(round(base), 0, 100)
 *
 * Two critical mechanisms prevent overconfidence on weak answers:
 * 1. AI relevance multiplier — score is scaled by (avgAiRelevance / 0.5).
 *    If sources are unrelated to the question, even many high-trust sources
 *    yield a low score.
 * 2. Summary hedging penalty — if the synthesized answer admits insufficient
 *    information, a flat 35-point penalty is applied regardless of other factors.
 */
export function computeConfidence(params: {
  citations: Citation[];
  contradictions: Contradiction[];
  hasOfficialSource: boolean;
  hasCodeExample: boolean;
  aiRelevanceScore?: number;
  summary?: string;
}): ConfidenceReport {
  const { citations, contradictions, hasOfficialSource, hasCodeExample, aiRelevanceScore, summary } = params;
  let score = 40;

  const sourceCount = citations.length;
  score += Math.min(sourceCount * 8, 32);

  const avgTrust = sourceCount > 0 ? citations.reduce((s, c) => s + (c.trustScore ?? 40), 0) / sourceCount : 0;
  score += (avgTrust / 100) * 20;

  if (hasOfficialSource) score += 10;
  if (hasCodeExample) score += 5;

  const unresolved = contradictions.filter((c) => c.resolution !== "official_wins").length;
  score -= unresolved * 12;

  // AI relevance multiplier: score is scaled by (relevance / 0.5 baseline)
  // At relevance=0.5 → no change; at 0 → score goes to 0; at 1.0 → ×2 but capped at 100
  if (aiRelevanceScore !== undefined) {
    const multiplier = Math.max(0, aiRelevanceScore / 0.5);
    score = score * multiplier;
  }

  // Summary hedging penalty: if ANY hedging phrase is found, subtract 35 points
  // This is intentionally blunt — if the model admits weakness, confidence drops hard
  let hedgingFound = false;
  if (summary) {
    for (const pattern of HEDGING_PATTERNS) {
      if (pattern.test(summary)) {
        hedgingFound = true;
        break;
      }
    }
  }
  if (hedgingFound) {
    score -= 35;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const evidence: string[] = [];
  const unknowns: string[] = [];
  const weaknesses: string[] = [];

  if (sourceCount >= 3) evidence.push(`${sourceCount} independent sources consulted`);
  else unknowns.push("Few independent sources were found — treat this answer as provisional");

  if (hasOfficialSource) evidence.push("At least one official/authoritative source was used");
  else weaknesses.push("No official documentation source was found");

  if (aiRelevanceScore !== undefined && aiRelevanceScore < 0.4) {
    weaknesses.push("Sources have low relevance to the question — the answer may not be reliable");
  }

  if (hedgingFound) {
    weaknesses.push("The generated answer indicates uncertainty — the synthesis found insufficient data");
  }

  if (unresolved > 0) weaknesses.push(`${unresolved} unresolved contradiction(s) between sources`);
  if (!hasCodeExample && sourceCount > 0) unknowns.push("No concrete code example was found for this answer");

  return { score, evidence, unknowns, weaknesses };
}
