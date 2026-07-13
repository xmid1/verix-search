import { Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";

/**
 * Queue names mirror the spec's worker architecture. Each queue can be
 * scaled independently by running `npm run worker` in more processes.
 */
export const QUEUE_NAMES = [
  "search",
  "crawler",
  "extraction",
  "ranking",
  "embedding",
  "summarization",
  "cleanup",
  "batch-research",
  "watcher",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * BullMQ vendors its own ioredis version internally, which is not
 * type-compatible with the standalone `ioredis` instance used elsewhere in
 * this project (src/infra/cache.ts) when two copies of ioredis end up in
 * node_modules. To avoid that identity mismatch entirely, BullMQ builds its
 * OWN redis connections from a plain options object instead of reusing our
 * ioredis instance.
 */
function connectionOptionsFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

const connection = connectionOptionsFromUrl(env.REDIS_URL);

export const queues: Record<QueueName, Queue> = Object.fromEntries(
  QUEUE_NAMES.map((name) => [name, new Queue(name, { connection })])
) as Record<QueueName, Queue>;

export function getQueueEvents(name: QueueName): QueueEvents {
  return new QueueEvents(name, { connection: connectionOptionsFromUrl(env.REDIS_URL) });
}
