/**
 * Heuristic cross-encoder reranker.
 *
 * Computes a "topic alignment" score for each query–document pair by
 * measuring how many of the query's core concepts are covered in the
 * document's title and snippet.
 *
 * This penalises "keyword hijacking" — e.g. matching "production" +
 * "build" while the document is about Express deployment, not AI agents.
 */

interface RerankerInput {
  id: string;
  query: string;
  title: string;
  snippet: string;
  provider: string;
  finalScore: number;
}

/**
 * Pre-compiled stopword set for concept extraction.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "it", "its", "this", "that",
  "as", "if", "not", "so", "we", "you", "he", "she", "they", "i", "my",
  "your", "our", "their", "can", "will", "would", "could", "should",
  "what", "which", "who", "whom", "how", "where", "when", "why",
  "want", "need", "get", "make", "use", "build", "create", "find",
  "best", "good", "great", "top", "new", "latest", "all", "some", "any",
  "about", "into", "over", "up", "out", "off", "down", "just", "also",
  "very", "too", "much", "more", "most", "many", "such", "than", "then",
  "now", "here", "there", "only", "really", "actually", "still", "even",
  "well", "back", "being", "done", "going", "know", "take", "see",
  "like", "look", "way", "thing", "things", "something", "everything",
  "nothing", "someone", "everyone", "anyone", "anything",
]);

/**
 * Extract meaningful concepts (noun phrases, compound terms) from a query.
 * Also extracts bigrams for compound concepts like "autonomous agent".
 */
function extractConcepts(text: string): Set<string> {
  // Normalise hyphens and other word separators so "SWE-agent" → "swe agent"
  const normalised = text.replace(/[-–—]/g, " ").toLowerCase();
  const words = normalised.split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  const concepts = new Set<string>();

  // Single significant words (≥3 chars catches acronyms like SWE, LLM, API)
  for (const w of words) {
    if (w.length >= 3 && !STOPWORDS.has(w)) {
      concepts.add(w);
    }
  }

  // Bigrams that form compound concepts
  for (let i = 0; i < words.length - 1; i++) {
    const word = words[i]!;
    const nextWord = words[i + 1]!;
    const bigram = `${word} ${nextWord}`;
    if (bigram.length > 6 && !STOPWORDS.has(word)) {
      concepts.add(bigram);
    }
  }

  return concepts;
}

/**
 * Compute topic alignment score (0-1) for a single document pair.
 *
 * Factors:
 *  - conceptCoverage: how many query concepts appear in the doc (0.5 weight)
 *  - bigramOverlap:   whether key bigrams appear (0.2 weight)
 *  - sourcePenalty:   whether the provider is off-topic for this query (0.3 weight)
 */
export function computeTopicAlignment(
  query: string,
  title: string,
  snippet: string,
  provider: string
): number {
  const queryConcepts = extractConcepts(query);
  if (queryConcepts.size === 0) return 0.5;

  const docText = `${title} ${snippet ?? ""}`.toLowerCase();
  const docConcepts = extractConcepts(docText);
  const originalDocText = `${title} ${snippet ?? ""}`;

  // Concept coverage: how many query concepts appear in the document text.
  // Handles singular/plural via suffix stripping ("agents" → "agent").
  function stripPlural(w: string): string {
    return w.endsWith("s") ? w.slice(0, -1) : w;
  }
  let coveredCount = 0;
  for (const concept of queryConcepts) {
    if (concept.includes(" ")) {
      if (docText.includes(concept)) coveredCount++;
    } else {
      if (docConcepts.has(concept)) coveredCount++;
      else if (docConcepts.has(stripPlural(concept))) coveredCount++;
      else if (docConcepts.has(concept + "s")) coveredCount++;
    }
  }
  const conceptCoverage = queryConcepts.size > 0 ? coveredCount / queryConcepts.size : 0;

  // Bigram overlap: key compound terms from query in doc
  const queryBigrams = Array.from(queryConcepts).filter((c) => c.includes(" "));
  let bigramOverlap = 0;
  if (queryBigrams.length > 0) {
    const matched = queryBigrams.filter((b) => docText.includes(b));
    bigramOverlap = matched.length / queryBigrams.length;
  } else {
    bigramOverlap = conceptCoverage; // fallback
  }

  // Source relevance: penalize off-topic providers for research queries
  const IRRELEVANT_SOURCE_PENALTY: Record<string, string[]> = {
    mdn: ["agent", "autonomous", "research", "paper", "LLM", "benchmark"],
    devto: ["research", "paper", "arxiv", "LLM benchmark"],
  };
  let sourcePenalty = 0;
  for (const [src, terms] of Object.entries(IRRELEVANT_SOURCE_PENALTY)) {
    if (provider === src) {
      const matchedTerm = terms.some((t) => query.toLowerCase().includes(t));
      if (matchedTerm) {
        sourcePenalty = 0.4;
      }
    }
  }

  // Proper-case disambiguation: words like "ReAct" (reasoning agent) lower to
  // "react" which falsely matches "reactjs/react.dev" (React.js library).
  // Detect query words with interior capitals whose lowercased form appears
  // in the doc text but the properly-cased original does not in the ORIGINAL
  // (non-lowercased) doc text.
  const queryWords = query.split(/[^a-z0-9]+/i);
  for (const word of queryWords) {
    if (word.length < 3) continue;
    // Check for interior uppercase (after first char)
    const interiorUpper = /.[A-Z]/.test(word);
    if (!interiorUpper) continue;
    const lower = word.toLowerCase();
    // Doc has lowercased form but NOT the properly-cased original → false match
    if (docText.includes(lower) && !originalDocText.includes(word)) {
      sourcePenalty = Math.max(sourcePenalty, 0.3);
    }
  }

  const score = conceptCoverage * 0.5 + bigramOverlap * 0.2 + (1 - sourcePenalty) * 0.3;
  return Math.min(score, 1);
}

/**
 * Rerank results using topic alignment as the primary ordering signal.
 *
 * Composite score = 0.4 × normalisedFinalScore + 0.6 × topicAlignment.
 *
 * Alignment has 60% weight so off-topic results (e.g. react.dev for an AI
 * agent query) are pushed below relevant results even if their raw BM25
 * score is higher — the reranker is designed to FIX keyword hijacking, not
 * just modestly adjust scores.
 *
 * The final score retains the 0-100 scale of the original for backward
 * compatibility (consumers expecting a score, not just an ordering).
 */
export function rerank(
  query: string,
  results: RerankerInput[]
): RerankerInput[] {
  if (results.length === 0) return results;

  // Compute alignment for every result first
  const withAlignment = results.map((r) => ({
    ...r,
    alignment: computeTopicAlignment(query, r.title, r.snippet, r.provider),
  }));

  // Normalise original scores to 0-1 so alignment doesn't get drowned
  // by magnitude differences that have nothing to do with topic fit.
  const maxScore = Math.max(...withAlignment.map((r) => r.finalScore), 1);

  for (const r of withAlignment) {
    const normalisedScore = maxScore > 0 ? r.finalScore / maxScore : 0;
    // Composite: 40% original score + 60% alignment
    const composite = 0.4 * normalisedScore + 0.6 * r.alignment;
    // Rescale to the same 0-100 range as the input scores
    r.finalScore = Math.round(composite * 100);
  }

  withAlignment.sort((a, b) => b.finalScore - a.finalScore);
  return withAlignment;
}
