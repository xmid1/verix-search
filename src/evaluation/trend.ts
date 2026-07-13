import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { BenchmarkSummary } from "./types.js";

export interface TrendPoint {
  runId: string;
  timestamp: string;
  overallScore: number;
  avgPrecisionAt5: number;
  avgNdcgAt5: number;
  avgMrr: number;
  avgProviderDiversity: number;
  avgLatencyMs: number;
  determinismRate: number;
  adversarialPassRate: number;
  excludedTopicViolations: number;
}

const TREND_FILE = join(process.cwd(), "reports", ".trends.json");

export function loadTrends(): TrendPoint[] {
  try {
    if (existsSync(TREND_FILE)) {
      return JSON.parse(readFileSync(TREND_FILE, "utf-8")) as TrendPoint[];
    }
  } catch { /* ignore corrupt files */ }
  return [];
}

export function saveTrend(summary: BenchmarkSummary, adversarialPassRate: number): TrendPoint[] {
  const trends = loadTrends();
  trends.push({
    runId: summary.version,
    timestamp: summary.timestamp,
    overallScore: summary.overallScore,
    avgPrecisionAt5: summary.avgPrecisionAt5,
    avgNdcgAt5: summary.avgNdcgAt5,
    avgMrr: summary.avgMrr,
    avgProviderDiversity: summary.avgProviderDiversity,
    avgLatencyMs: summary.avgLatencyMs,
    determinismRate: summary.determinismRate,
    adversarialPassRate,
    excludedTopicViolations: summary.excludedTopicViolations,
  });
  const dir = join(process.cwd(), "reports");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TREND_FILE, JSON.stringify(trends, null, 2));
  return trends;
}

export function printTrendComparison(current: TrendPoint, trends: TrendPoint[]): string[] {
  if (trends.length < 2) return [];
  const prev = trends[trends.length - 2]!;
  const lines: string[] = [];

  const deltas: Array<{ label: string; current: number; prev: number; higherIsBetter: boolean }> = [
    { label: "Overall Score", current: current.overallScore, prev: prev.overallScore, higherIsBetter: true },
    { label: "P@5", current: current.avgPrecisionAt5 * 100, prev: prev.avgPrecisionAt5 * 100, higherIsBetter: true },
    { label: "NDCG@5", current: current.avgNdcgAt5 * 100, prev: prev.avgNdcgAt5 * 100, higherIsBetter: true },
    { label: "MRR", current: current.avgMrr * 100, prev: prev.avgMrr * 100, higherIsBetter: true },
    { label: "Provider Diversity", current: current.avgProviderDiversity, prev: prev.avgProviderDiversity, higherIsBetter: true },
    { label: "Latency", current: current.avgLatencyMs, prev: prev.avgLatencyMs, higherIsBetter: false },
    { label: "Determinism", current: current.determinismRate * 100, prev: prev.determinismRate * 100, higherIsBetter: true },
    { label: "Excluded Topics", current: current.excludedTopicViolations, prev: prev.excludedTopicViolations, higherIsBetter: false },
  ];

  for (const d of deltas) {
    const diff = d.current - d.prev;
    if (Math.abs(diff) < 0.5) continue;
    const arrow = d.higherIsBetter ? (diff > 0 ? "↑" : "↓") : (diff > 0 ? "↓" : "↑");
    lines.push(`     ${arrow} ${d.label}: ${d.current.toFixed(1)} (${diff > 0 ? "+" : ""}${diff.toFixed(1)})`);
  }

  return lines;
}
