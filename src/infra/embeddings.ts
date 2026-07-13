import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Embedding provider abstraction. Verix must not be tied to one vendor
 * (spec section: Embeddings). Default is a local, in-process model via
 * @huggingface/transformers — no API key, no external network call, runs
 * entirely inside this container. Additional providers (OpenAI, Gemini,
 * Voyage, Jina, Ollama...) can be dropped in by implementing this interface.
 */
export interface EmbeddingProvider {
  id: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

class LocalTransformersEmbeddingProvider implements EmbeddingProvider {
  id = "local-transformers";
  dimensions = env.EMBEDDING_DIM;
  private pipelinePromise: Promise<any> | null = null;

  private async getPipeline() {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const { pipeline, env: hfEnv } = await import("@huggingface/transformers");
        // Keep model cache inside the project's persistent disk.
        hfEnv.cacheDir = ".cache/transformers";
        logger.info({ model: env.EMBEDDING_MODEL }, "loading local embedding model");
        return pipeline("feature-extraction", env.EMBEDDING_MODEL);
      })();
    }
    return this.pipelinePromise;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getPipeline();
    const results: number[][] = [];
    for (const text of texts) {
      const output = await extractor(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data as Float32Array));
    }
    return results;
  }
}

const providers: Record<string, () => EmbeddingProvider> = {
  local: () => new LocalTransformersEmbeddingProvider(),
};

function resolveProvider(): EmbeddingProvider {
  const factory = providers[env.EMBEDDING_PROVIDER];
  if (!factory) {
    throw new Error(
      `Embedding provider "${env.EMBEDDING_PROVIDER}" is not wired up yet. Implement EmbeddingProvider and register it in src/infra/embeddings.ts.`
    );
  }
  return factory();
}

export const embeddingProvider = resolveProvider();

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
