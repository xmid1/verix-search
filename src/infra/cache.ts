import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ connections sharing this pattern
  enableReadyCheck: true,
});

redis.on("error", (err: Error) => logger.error({ err }, "redis connection error"));
redis.on("connect", () => logger.info("redis connected"));

/** Separate connection instance for BullMQ (it manages blocking commands and needs its own connection). */
export function createRedisConnection() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.set(key, payload, "EX", ttlSeconds);
  } else {
    await redis.set(key, payload);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}
