import type { BenchmarkThresholds, QualityReport } from "./types.js";
import { getThresholds } from "./types.js";

export interface GateConfig {
  thresholds: BenchmarkThresholds;
  failOnExcludedTopics: boolean;
  maxDegradedRate: number;
  minDeterminismRate: number;
  minAdversarialPassRate: number;
  outputHtml: boolean;
  outputDir: string;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  thresholds: getThresholds(),
  failOnExcludedTopics: true,
  maxDegradedRate: 0.5,
  minDeterminismRate: 1.0,
  minAdversarialPassRate: 0.8,
  outputHtml: true,
  outputDir: "./reports",
};

export function evaluateGate(report: QualityReport, config: GateConfig = DEFAULT_GATE_CONFIG): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const summary = report.summary;

  if (summary.avgPrecisionAt5 < config.thresholds.precisionAt5) {
    reasons.push(`Precision@5 ${(summary.avgPrecisionAt5 * 100).toFixed(1)}% < threshold ${(config.thresholds.precisionAt5 * 100)}%`);
  }

  if (summary.avgNdcgAt5 < config.thresholds.ndcgAt5) {
    reasons.push(`NDCG@5 ${(summary.avgNdcgAt5 * 100).toFixed(1)}% < threshold ${(config.thresholds.ndcgAt5 * 100)}%`);
  }

  if (summary.avgMrr < config.thresholds.mrr) {
    reasons.push(`MRR ${(summary.avgMrr * 100).toFixed(1)}% < threshold ${(config.thresholds.mrr * 100)}%`);
  }

  if (summary.avgProviderDiversity < config.thresholds.providerDiversity) {
    reasons.push(`Provider diversity ${summary.avgProviderDiversity.toFixed(1)} < threshold ${config.thresholds.providerDiversity}`);
  }

  if (summary.avgLatencyMs > config.thresholds.maxLatencyMs) {
    reasons.push(`Avg latency ${summary.avgLatencyMs.toFixed(0)}ms > threshold ${config.thresholds.maxLatencyMs}ms`);
  }

  if (config.failOnExcludedTopics && summary.excludedTopicViolations > 0) {
    reasons.push(`${summary.excludedTopicViolations} query(s) have excluded topic violations`);
  }

  if (summary.determinismRate < config.minDeterminismRate) {
    reasons.push(`Determinism rate ${(summary.determinismRate * 100).toFixed(0)}% < ${(config.minDeterminismRate * 100)}%`);
  }

  if (summary.degradedRate > config.maxDegradedRate) {
    reasons.push(`Degraded rate ${(summary.degradedRate * 100).toFixed(1)}% > max ${(config.maxDegradedRate * 100)}%`);
  }

  const advPassed = report.adversarialResults.filter((r) => r.passed).length;
  const advRate = report.adversarialResults.length > 0 ? advPassed / report.adversarialResults.length : 1;
  if (advRate < config.minAdversarialPassRate) {
    reasons.push(`Adversarial pass rate ${(advRate * 100).toFixed(0)}% < ${(config.minAdversarialPassRate * 100)}%`);
  }

  return { passed: reasons.length === 0, reasons };
}
