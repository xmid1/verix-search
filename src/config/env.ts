import "dotenv/config";
import { z } from "zod";

/**
 * Centralized, validated configuration (replaces the "Convict" layer from the
 * original spec — Zod gives us the same fail-fast validation with full TS
 * inference, which is more idiomatic in a TypeScript-first codebase).
 *
 * The app refuses to boot if a required variable is missing or malformed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  API_VERSION: z.string().default("v1"),

  // Database (Supabase Postgres + pgvector). Named distinctly from
  // DATABASE_URL because that key is reserved/managed by Replit's own
  // Postgres provisioning flow.
  SUPABASE_DATABASE_URL: z.string().min(1, "SUPABASE_DATABASE_URL is required"),

  // Cache / queues
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // CORS
  CORS_ORIGIN: z.string().default("*"),

  // Auth
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters in production"),
  JWT_EXPIRES_IN: z.string().default("12h"),

  // Embeddings
  EMBEDDING_PROVIDER: z.enum(["local", "openai", "gemini", "voyage", "jina", "ollama"]).default("local"),
  EMBEDDING_MODEL: z.string().default("Xenova/all-MiniLM-L6-v2"),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(384),

  // LLM (OpenCode Zen, OpenAI-compatible gateway)
  OPENCODE_API_KEY: z.string().min(1, "OPENCODE_API_KEY is required"),
  LLM_BASE_URL: z.string().url().default("https://opencode.ai/zen/v1"),
  LLM_MODEL: z.string().default("deepseek-v4-flash-free"),
  LLM_PLANNER_MODEL: z.string().default("deepseek-v4-flash-free"),
  LLM_RESEARCH_MODEL: z.string().default("deepseek-v4-flash-free"),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),

  // Provider-specific API keys (optional — enables higher-quality results)
  REDDIT_CLIENT_ID: z.string().default(""),
  REDDIT_CLIENT_SECRET: z.string().default(""),
  BRAVE_API_KEY: z.string().default(""),
  TWITTER_BEARER_TOKEN: z.string().default(""),
  GOOGLE_API_KEY: z.string().default(""),
  GOOGLE_CSE_ID: z.string().default(""),

  // Crawler settings
  CRAWLER_JS_RENDER: z.coerce.boolean().default(false),
  CRAWLER_WEBHOOK_URL: z.string().default(""),

  // Tuning
  SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MAX_PROVIDERS_PER_QUERY: z.coerce.number().int().positive().default(8),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Fail loudly and immediately — no silent fallback to a half-working config.
    // eslint-disable-next-line no-console
    console.error(`\n✖ Invalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }
  const config = parsed.data;

  if (config.JWT_SECRET === "dev-only-insecure-secret-change-me") {
    if (config.NODE_ENV === "production") {
      console.error("\n✖ JWT_SECRET is set to the insecure default value in production!");
      console.error("   Set JWT_SECRET to a strong, unique value via environment variable.\n");
      process.exit(1);
    }
    console.error("\n⚠  WARNING: JWT_SECRET is set to the insecure default value.");
    console.error("   Set a strong JWT_SECRET for any non-development deployment.\n");
  }

  if (config.CORS_ORIGIN === "*" && config.NODE_ENV === "production") {
    console.error("\n⚠  WARNING: CORS_ORIGIN is set to '*' in production!");
    console.error("   Restrict it to your domain for security: CORS_ORIGIN=https://app.example.com\n");
  }

  return config;
}

export const env = loadEnv();
