import type { Citation, Contradiction } from "../../core/types.js";
import { chatJSON } from "../../infra/llm.js";
import { env } from "../../config/env.js";
import { childLogger } from "../../infra/logger.js";

const logger = childLogger({ module: "research:contradictions" });

/**
 * Contradiction Engine (spec §39): compares extracted claims across sources
 * and surfaces disagreements instead of silently picking one. When one side
 * is an official source, it wins; otherwise both are shown as unresolved.
 */
export async function detectContradictions(
  question: string,
  sources: Array<{ url: string; title: string; trustScore: number; text: string }>
): Promise<Contradiction[]> {
  if (sources.length < 2) return [];

  const corpus = sources
    .map((s, i) => `[${i + 1}] (${s.url}, trust=${s.trustScore}) ${s.title}\n${s.text.slice(0, 1500)}`)
    .join("\n\n");

  try {
    const raw = await chatJSON<
      Array<{ topic: string; claimAIndex: number; claimAText: string; claimBIndex: number; claimBText: string; officialWins: boolean }>
    >(
      `Question: "${question}"\n\nSources:\n${corpus}\n\n` +
        `Identify factual contradictions BETWEEN sources (not just differences in phrasing). ` +
        `Return a JSON array (empty if none) of objects: { topic, claimAIndex, claimAText, claimBIndex, claimBText, officialWins }. ` +
        `Indexes are 1-based referring to the [n] source list above. officialWins=true only if one source is clearly official documentation/RFC and contradicts an unofficial source.`,
      { model: env.LLM_RESEARCH_MODEL, maxTokens: 800 }
    );
    if (!Array.isArray(raw)) return [];

    const toCitation = (idx: number): Citation | null => {
      const s = sources[idx - 1];
      if (!s) return null;
      return { url: s.url, title: s.title, trustScore: s.trustScore };
    };

    return raw
      .map((c): Contradiction | null => {
        const a = toCitation(c.claimAIndex);
        const b = toCitation(c.claimBIndex);
        if (!a || !b) return null;
        return {
          topic: c.topic,
          claimA: { text: c.claimAText, source: a },
          claimB: { text: c.claimBText, source: b },
          resolution: c.officialWins ? "official_wins" : "unresolved",
        };
      })
      .filter((c): c is Contradiction => c !== null);
  } catch (err) {
    logger.warn({ err }, "contradiction detection failed, assuming none found");
    return [];
  }
}
