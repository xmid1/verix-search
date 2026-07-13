import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * LLM access via OpenCode Zen — an OpenAI-compatible gateway
 * (https://opencode.ai/zen) offering curated coding/reasoning models under a
 * single API key, including several free tiers. We talk to it with the
 * standard OpenAI SDK pointed at its base URL, which keeps the door open to
 * swap in OpenAI/Anthropic/Gemini-compatible endpoints later without
 * touching call sites.
 */
export const llmClient = new OpenAI({
  apiKey: env.OPENCODE_API_KEY,
  baseURL: env.LLM_BASE_URL,
});

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
  /** Timeout in milliseconds passed via AbortSignal. Default: none (OpenAI SDK default ~10 min). */
  timeoutMs?: number;
}

export async function chatText(prompt: string, opts: ChatOptions = {}): Promise<string> {
  const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined;
  const response = await llmClient.chat.completions.create({
    model: opts.model ?? env.LLM_MODEL,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1200,
    messages: [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      { role: "user" as const, content: prompt },
    ],
  }, { signal });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Asks the model for strict JSON matching a caller-provided shape description,
 * with a best-effort extraction fallback if the model wraps the JSON in prose
 * or a markdown fence. Throws if no valid JSON can be recovered — no silent
 * fallback to a fabricated default.
 */
export async function chatJSON<T>(prompt: string, opts: ChatOptions = {}): Promise<T> {
  const raw = await chatText(
    `${prompt}\n\nRespond with ONLY valid JSON. No markdown fences, no commentary.`,
    { ...opts, temperature: opts.temperature ?? 0 }
  );
  return extractJSON<T>(raw);
}

export function extractJSON<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
  if (!cleaned) {
    throw new Error("LLM returned empty response");
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        // fall through
      }
    }
    logger.error({ raw }, "failed to parse LLM JSON response");
    throw new Error("LLM did not return parseable JSON");
  }
}
