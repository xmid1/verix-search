import client from "prom-client";

export const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new client.Histogram({
  name: "verix_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
  registers: [metricsRegistry],
});

export const searchLatency = new client.Histogram({
  name: "verix_search_latency_seconds",
  help: "End-to-end search latency",
  labelNames: ["mode"],
  buckets: [0.5, 1, 2, 4, 8, 15, 30, 60],
  registers: [metricsRegistry],
});

export const providerLatency = new client.Histogram({
  name: "verix_provider_latency_seconds",
  help: "Per-provider search latency",
  labelNames: ["provider", "outcome"],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

export const cacheHits = new client.Counter({
  name: "verix_semantic_cache_hits_total",
  help: "Semantic cache hits",
  registers: [metricsRegistry],
});

export const queueDepth = new client.Gauge({
  name: "verix_queue_depth",
  help: "Current depth of each BullMQ queue",
  labelNames: ["queue"],
  registers: [metricsRegistry],
});
