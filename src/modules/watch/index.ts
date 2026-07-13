import { nanoid } from "nanoid";
import { queues } from "../../infra/queue.js";
import { cacheGetJSON, cacheSetJSON, cacheDel } from "../../infra/cache.js";
import { childLogger } from "../../infra/logger.js";
import { executeSearch } from "../search/orchestrator.js";
import type { WatchSubscription, RankedResult } from "../../core/types.js";

const log = childLogger({ module: "watch" });
const WATCH_TTL = 30 * 86400;

export async function createWatchSubscription(
  query: string,
  threshold: number,
  webhookUrl: string,
  webhookSecret?: string,
  apiKeyId?: string
): Promise<{ id: string }> {
  const id = nanoid();
  const sub: WatchSubscription = {
    id,
    query,
    threshold,
    webhookUrl,
    webhookSecret,
    createdAt: new Date().toISOString(),
    lastCheckedAt: undefined,
    lastNotifiedAt: undefined,
    apiKeyId,
  };

  await cacheSetJSON(`watch:${id}`, sub, WATCH_TTL);

  await queues.watcher.add("watch-subscription", { subscriptionId: id }, {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    repeat: { every: 3600000 },
  });

  log.info({ watchId: id, query }, "watch subscription created");
  return { id };
}

export async function getWatchSubscription(id: string): Promise<WatchSubscription | null> {
  return cacheGetJSON<WatchSubscription>(`watch:${id}`);
}

export async function deleteWatchSubscription(id: string): Promise<void> {
  await cacheDel(`watch:${id}`);
  log.info({ watchId: id }, "watch subscription deleted");
}

export async function checkWatchSubscription(subscriptionId: string): Promise<void> {
  const sub = await getWatchSubscription(subscriptionId);
  if (!sub) {
    log.warn({ subscriptionId }, "watch subscription not found");
    return;
  }

  log.info({ watchId: sub.id, query: sub.query }, "checking watch subscription");

  const outcome = await executeSearch(sub.query, {
    limit: 10,
    apiKeyId: sub.apiKeyId,
    quick: true,
  });

  const highQualityNewResults = outcome.results.filter((r: RankedResult) => {
    if (!r.publishedAt) return false;
    const published = new Date(r.publishedAt).getTime();
    const lastChecked = sub.lastCheckedAt ? new Date(sub.lastCheckedAt).getTime() : 0;
    if (published <= lastChecked) return false;
    return r.finalScore >= sub.threshold;
  });

  sub.lastCheckedAt = new Date().toISOString();
  await cacheSetJSON(`watch:${sub.id}`, sub, WATCH_TTL);

  if (highQualityNewResults.length > 0) {
    sub.lastNotifiedAt = new Date().toISOString();
    await cacheSetJSON(`watch:${sub.id}`, sub, WATCH_TTL);

    try {
      const payload = JSON.stringify({
        event: "watch.alert",
        subscriptionId: sub.id,
        query: sub.query,
        newResults: highQualityNewResults.map((r: RankedResult) => ({
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          provider: r.provider,
          publishedAt: r.publishedAt,
          finalScore: r.finalScore,
        })),
        checkedAt: sub.lastCheckedAt,
      });

      await fetch(sub.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sub.webhookSecret ? { "X-Webhook-Secret": sub.webhookSecret } : {}),
        },
        body: payload,
        signal: AbortSignal.timeout(15000),
      });

      log.info({ watchId: sub.id, newResults: highQualityNewResults.length }, "watch alert webhook sent");
    } catch (err) {
      log.warn({ err, watchId: sub.id, webhookUrl: sub.webhookUrl }, "watch alert webhook delivery failed");
    }
  }
}

export async function checkAllWatchSubscriptions(): Promise<void> {
  log.info("checking all watch subscriptions");
}
