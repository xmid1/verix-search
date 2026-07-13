import { Worker } from "bullmq";
import { QUEUE_NAMES, type QueueName } from "../infra/queue.js";
import { env } from "../config/env.js";
import { logger } from "../infra/logger.js";

function connectionOptionsFromUrl(url: string) {
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

const handlers: Record<QueueName, (job: { id: string; data: unknown }) => Promise<unknown>> = {
  search: async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "processing search job");
    return { processed: true, queue: "search" };
  },

  crawler: async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "processing crawler job");
    return { processed: true, queue: "crawler" };
  },

  extraction: async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "processing extraction job");
    return { processed: true, queue: "extraction" };
  },

  ranking: async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "processing ranking job");
    return { processed: true, queue: "ranking" };
  },

  embedding: async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "processing embedding job");
    return { processed: true, queue: "embedding" };
  },

  summarization: async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "processing summarization job");
    return { processed: true, queue: "summarization" };
  },

  cleanup: async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "processing cleanup job");
    return { processed: true, queue: "cleanup" };
  },

  "batch-research": async (job) => {
    const data = job.data as { jobId: string; questions: string[]; webhookUrl?: string };
    logger.info({ jobId: job.id, batchId: data.jobId, questionCount: data.questions.length }, "processing batch research job");
    const { processBatchJob } = await import("../modules/research/batch.js");
    await processBatchJob(data.jobId, data.questions, data.webhookUrl);
    return { processed: true, queue: "batch-research", batchId: data.jobId };
  },

  watcher: async (job) => {
    const data = job.data as { subscriptionId?: string };
    logger.info({ jobId: job.id, data }, "processing watcher job");
    if (data.subscriptionId) {
      const { checkWatchSubscription } = await import("../modules/watch/index.js");
      await checkWatchSubscription(data.subscriptionId);
    }
    return { processed: true, queue: "watcher" };
  },
};

const workers: Worker[] = [];

for (const name of QUEUE_NAMES) {
  const worker = new Worker(name, async (job: any) => {
    const handler = handlers[name];
    if (!handler) throw new Error(`No handler for queue: ${name}`);
    return handler(job);
  }, { connection });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, queue: name }, "job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, queue: name, err }, "job failed");
  });

  workers.push(worker);
}

logger.info({ queues: QUEUE_NAMES }, "workers started, waiting for jobs");

process.on("SIGTERM", async () => {
  logger.info("shutting down workers");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
