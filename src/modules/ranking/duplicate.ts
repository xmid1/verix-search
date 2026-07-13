/**
 * Content-based deduplication in two passes:
 *
 * Pass 1 — Exact dedup via SHA-256 hash of normalized text
 *           (trimmed, lowercased, whitespace-collapsed).
 *           This is O(n) and catches verbatim duplicates cheaply.
 *
 * Pass 2 — Near-duplicate dedup via semantic embeddings + cosine similarity.
 *           If two items exceed `threshold` similarity, keep only the first
 *           (stable input order). This is O(n²) — candidate sets fed into
 *           ranking are small (≤ a few dozen results), so quadratic is fine.
 *
 * On embedding failure (Pass 2), degrades gracefully to exact-dedup only.
 */
import { createHash } from "node:crypto";
import { embeddingProvider, cosineSimilarity } from "../../infra/embeddings.js";
import { childLogger } from "../../infra/logger.js";

const log = childLogger({ module: "ranking:duplicate" });

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function deduplicateByContent<T extends { id: string; text: string }>(
  items: T[],
  threshold = 0.93,
  skipSemantic = false
): Promise<T[]> {
  if (items.length === 0) return [];

  // ── Pass 1: exact-hash dedup ──────────────────────────────────────────────
  const seenHashes = new Set<string>();
  const afterExact: T[] = [];
  for (const item of items) {
    const hash = sha256(normalizeText(item.text));
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      afterExact.push(item);
    }
  }

  if (afterExact.length <= 1 || skipSemantic) return afterExact;

  // ── Pass 2: semantic near-dedup ───────────────────────────────────────────
  // Embed all remaining items in one batch call.
  let embeddings: number[][];
  try {
    embeddings = await embeddingProvider.embed(afterExact.map((i) => i.text));
  } catch (err) {
    log.warn({ err }, "deduplicateByContent: embedding failed — skipping semantic pass");
    return afterExact;
  }

  // O(n²) pairwise check — acceptable for small candidate sets (≤ ~30 items).
  const dropped = new Set<number>();
  for (let i = 0; i < afterExact.length; i++) {
    if (dropped.has(i)) continue;
    for (let j = i + 1; j < afterExact.length; j++) {
      if (dropped.has(j)) continue;
      const sim = cosineSimilarity(embeddings[i]!, embeddings[j]!);
      if (sim >= threshold) {
        dropped.add(j); // keep i (first occurrence), drop j
      }
    }
  }

  return afterExact.filter((_, idx) => !dropped.has(idx));
}
