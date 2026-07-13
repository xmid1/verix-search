import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../../infra/db.js";
import type { AuthContext } from "../../core/types.js";
import { logger } from "../../infra/logger.js";

const KEY_PREFIX = "vx_live_";

export interface GeneratedApiKey {
  plaintext: string;
  prefix: string;
  hash: string;
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(24).toString("hex");
  const plaintext = `${KEY_PREFIX}${secret}`;
  const prefix = plaintext.slice(0, 16);
  return { plaintext, prefix, hash: hashApiKey(plaintext) };
}

/**
 * Verifies a raw API key against the store, updates lastUsedAt (fire-and-forget),
 * and returns the resolved AuthContext, or null if invalid/revoked/unknown.
 */
export async function verifyApiKey(plaintext: string): Promise<AuthContext | null> {
  if (!plaintext.startsWith(KEY_PREFIX)) return null;
  const hash = hashApiKey(plaintext);
  const record = await prisma.apiKey.findFirst({ where: { hash } });
  if (!record || record.revokedAt) return null;

  // Fire-and-forget usage tracking — must never block or fail the request.
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch((err) => logger.warn({ err }, "failed to update apiKey.lastUsedAt"));

  return {
    apiKeyId: record.id,
    role: record.role,
    scopes: record.scopes,
    projectId: record.projectId,
  };
}
