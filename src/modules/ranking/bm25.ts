/**
 * Okapi BM25 ranking over an in-memory document set.
 *
 * Parameters (standard values):
 *   k1 = 1.5  — term frequency saturation
 *   b  = 0.75 — length normalization
 *
 * Tokenization: lowercase + split on non-alphanumerics, drop empty tokens.
 * Returns a Map<id, score> normalized to 0-1 (divide by max score in batch).
 */

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function bm25Rank(
  query: string,
  documents: { id: string; text: string }[]
): Map<string, number> {
  const result = new Map<string, number>();
  if (documents.length === 0) return result;

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    for (const doc of documents) result.set(doc.id, 0);
    return result;
  }

  // Tokenize all documents
  const tokenizedDocs = documents.map((doc) => ({
    id: doc.id,
    tokens: tokenize(doc.text),
  }));

  // Compute average document length
  const totalLen = tokenizedDocs.reduce((sum, d) => sum + d.tokens.length, 0);
  const avgDL = totalLen / tokenizedDocs.length;

  const N = tokenizedDocs.length;

  // Build term -> document frequency map
  const df = new Map<string, number>();
  for (const doc of tokenizedDocs) {
    const seen = new Set<string>();
    for (const token of doc.tokens) {
      if (!seen.has(token)) {
        df.set(token, (df.get(token) ?? 0) + 1);
        seen.add(token);
      }
    }
  }

  // Score each document
  let maxScore = 0;

  for (const doc of tokenizedDocs) {
    const dl = doc.tokens.length;

    // Term frequency map for this document
    const tf = new Map<string, number>();
    for (const token of doc.tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    let score = 0;
    for (const term of queryTerms) {
      const termTF = tf.get(term) ?? 0;
      if (termTF === 0) continue; // term not in document

      const termDF = df.get(term) ?? 0;
      // IDF with smoothing to avoid log(0) when all docs contain the term
      const idf = Math.log((N - termDF + 0.5) / (termDF + 0.5) + 1);

      // BM25 TF component
      const tfComponent =
        (termTF * (K1 + 1)) /
        (termTF + K1 * (1 - B + B * (dl / avgDL)));

      score += idf * tfComponent;
    }

    result.set(doc.id, score);
    if (score > maxScore) maxScore = score;
  }

  // Normalize to 0-1 (guard against divide-by-zero when all scores are 0)
  if (maxScore > 0) {
    for (const [id, score] of result) {
      result.set(id, score / maxScore);
    }
  }

  return result;
}
