import { nanoid } from "nanoid";
import { queues } from "../../infra/queue.js";
import { cacheGetJSON, cacheSetJSON } from "../../infra/cache.js";
import type { BatchResearchJob, ResearchAnswer } from "../../core/types.js";
import { childLogger } from "../../infra/logger.js";
import { runDeepResearch } from "./index.js";

const log = childLogger({ module: "research:batch" });
const BATCH_TTL = 86400;

export async function createBatchJob(
  questions: string[],
  webhookUrl?: string
): Promise<{ jobId: string }> {
  const id = nanoid();
  const job: BatchResearchJob = {
    id,
    questions,
    status: "pending",
    answers: [],
    errors: [],
    createdAt: new Date().toISOString(),
    webhookUrl,
  };

  await cacheSetJSON(`batch-research:${id}`, job, BATCH_TTL);

  await queues["batch-research"].add("batch-research-job", {
    jobId: id,
    questions,
    webhookUrl,
  }, {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  });

  log.info({ jobId: id, questionCount: questions.length }, "batch research job created");
  return { jobId: id };
}

export async function getBatchJob(jobId: string): Promise<BatchResearchJob | null> {
  return cacheGetJSON<BatchResearchJob>(`batch-research:${jobId}`);
}

export async function processBatchJob(jobId: string, questions: string[], webhookUrl?: string): Promise<void> {
  const job = await getBatchJob(jobId);
  if (!job) {
    log.warn({ jobId }, "batch job not found for processing");
    return;
  }

  job.status = "processing";
  await cacheSetJSON(`batch-research:${jobId}`, job, BATCH_TTL);

  const results = await Promise.allSettled(
    questions.map((q) => runDeepResearch(q, { useCache: true }))
  );

  job.answers = [];
  job.errors = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      job.answers.push(r.value);
      job.errors.push(null);
    } else {
      job.answers.push(null);
      job.errors.push(r.reason?.message ?? "Unknown error");
    }
  }

  job.status = "completed";
  job.completedAt = new Date().toISOString();
  await cacheSetJSON(`batch-research:${jobId}`, job, BATCH_TTL);

  if (job.webhookUrl) {
    try {
      const payload = JSON.stringify({ event: "batch-research.completed", jobId, status: "completed", answers: job.answers, errors: job.errors });
      await fetch(job.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(10000),
      });
      log.info({ jobId, webhookUrl: job.webhookUrl }, "webhook delivered");
    } catch (err) {
      log.warn({ err, jobId, webhookUrl: job.webhookUrl }, "webhook delivery failed");
    }
  }
}
