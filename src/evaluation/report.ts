import * as fs from "node:fs";
import * as path from "node:path";
import type { QualityReport, BenchmarkResult, BenchmarkThresholds } from "./types.js";

function getResultViolations(r: BenchmarkResult, t: BenchmarkThresholds): Array<{ metric: string; expected: string; actual: string }> {
  const v: Array<{ metric: string; expected: string; actual: string }> = [];
  if (r.precisionAt5 < t.precisionAt5) v.push({ metric: "Precision@5", expected: `${(t.precisionAt5 * 100).toFixed(0)}%`, actual: `${(r.precisionAt5 * 100).toFixed(0)}%` });
  if (r.precisionAt10 < t.precisionAt10) v.push({ metric: "Precision@10", expected: `${(t.precisionAt10 * 100).toFixed(0)}%`, actual: `${(r.precisionAt10 * 100).toFixed(0)}%` });
  if (r.ndcgAt5 < t.ndcgAt5) v.push({ metric: "NDCG@5", expected: `${(t.ndcgAt5 * 100).toFixed(0)}%`, actual: `${(r.ndcgAt5 * 100).toFixed(0)}%` });
  if (r.ndcgAt10 < t.ndcgAt10) v.push({ metric: "NDCG@10", expected: `${(t.ndcgAt10 * 100).toFixed(0)}%`, actual: `${(r.ndcgAt10 * 100).toFixed(0)}%` });
  if (r.mrr < t.mrr) v.push({ metric: "MRR", expected: `${(t.mrr * 100).toFixed(0)}%`, actual: `${(r.mrr * 100).toFixed(0)}%` });
  if (r.avgTrustScore < t.avgTrustScore) v.push({ metric: "Trust", expected: `${t.avgTrustScore}`, actual: `${r.avgTrustScore.toFixed(0)}` });
  if (r.providerDiversity < t.providerDiversity) v.push({ metric: "Providers", expected: `≥${t.providerDiversity}`, actual: `${r.providerDiversity}` });
  if (r.latencyMs > t.maxLatencyMs) v.push({ metric: "Latency", expected: `<${t.maxLatencyMs}ms`, actual: `${r.latencyMs}ms` });
  if (!r.deterministicScore) v.push({ metric: "Determinism", expected: "true", actual: "false" });
  if (r.hasExcludedTopics) v.push({ metric: "Excluded Topics", expected: "none", actual: "found" });
  return v;
}

export function generateHtmlReport(report: QualityReport): string {
  const s = report.summary;
  const t = report.thresholds;
  const passColor = s.overallScore >= 70 ? "#22c55e" : s.overallScore >= 50 ? "#f59e0b" : "#ef4444";
  const passText = s.overallScore >= 70 ? "PASS" : s.overallScore >= 50 ? "WARN" : "FAIL";

  const metricRow = (label: string, value: string, target: string, pass: boolean) => `
<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">${label}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${value}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;">${target}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${pass ? '<span style="color:#22c55e;font-size:18px;">✓</span>' : '<span style="color:#ef4444;font-size:18px;">✗</span>'}</td>
</tr>`;

  const aggMetrics = [
    metricRow("Precision@5", `${(s.avgPrecisionAt5 * 100).toFixed(1)}%`, `≥${(t.precisionAt5 * 100).toFixed(0)}%`, s.avgPrecisionAt5 >= t.precisionAt5),
    metricRow("Precision@10", `${(s.avgPrecisionAt10 * 100).toFixed(1)}%`, `≥${(t.precisionAt10 * 100).toFixed(0)}%`, s.avgPrecisionAt10 >= t.precisionAt10),
    metricRow("NDCG@5", `${(s.avgNdcgAt5 * 100).toFixed(1)}%`, `≥${(t.ndcgAt5 * 100).toFixed(0)}%`, s.avgNdcgAt5 >= t.ndcgAt5),
    metricRow("NDCG@10", `${(s.avgNdcgAt10 * 100).toFixed(1)}%`, `≥${(t.ndcgAt10 * 100).toFixed(0)}%`, s.avgNdcgAt10 >= t.ndcgAt10),
    metricRow("MRR", `${(s.avgMrr * 100).toFixed(1)}%`, `≥${(t.mrr * 100).toFixed(0)}%`, s.avgMrr >= t.mrr),
    metricRow("MAP@10", `${(s.avgMapAt10 * 100).toFixed(1)}%`, "≥50%", s.avgMapAt10 >= 0.5),
    metricRow("Bpref", `${(s.avgBpref * 100).toFixed(1)}%`, "≥25%", s.avgBpref >= 0.25),
    metricRow("Provider Diversity", s.avgProviderDiversity.toFixed(1), `≥${t.providerDiversity}`, s.avgProviderDiversity >= t.providerDiversity),
    metricRow("Avg Latency", `${s.avgLatencyMs.toFixed(0)}ms`, `<${t.maxLatencyMs}ms`, s.avgLatencyMs < t.maxLatencyMs),
    metricRow("Determinism", `${(s.determinismRate * 100).toFixed(0)}%`, "100%", s.determinismRate >= 1),
    metricRow("Degraded Rate", `${(s.degradedRate * 100).toFixed(1)}%`, "<100%", true),
    metricRow("Excluded Topics", `${s.excludedTopicViolations}`, "0", s.excludedTopicViolations === 0),
    metricRow("Reranker Alignment", `${(s.avgRerankerAlignment * 100).toFixed(1)}%`, "≥50%", s.avgRerankerAlignment >= 0.5),
  ].join("\n");

  const resultRows = s.results.map((r) => {
    const violations = getResultViolations(r, t);
    const hasViolations = violations.length > 0;
    const col = (v: string, color?: string) => `<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;${color ? `color:${color};` : ""}">${v}</td>`;

    const nameCol = col(`<span style="font-weight:600;">${r.queryId}</span><br><span style="font-size:11px;color:#94a3b8;">${r.query.length > 60 ? r.query.slice(0, 60) + "…" : r.query}</span>`);
    const p5Col = col(`${(r.precisionAt5 * 100).toFixed(0)}%`, r.precisionAt5 >= t.precisionAt5 ? "#22c55e" : "#ef4444");
    const n5Col = col(`${(r.ndcgAt5 * 100).toFixed(0)}%`, r.ndcgAt5 >= t.ndcgAt5 ? "#22c55e" : "#ef4444");
    const mrrCol = col(`${(r.mrr * 100).toFixed(0)}%`);
    const divCol = col(`${r.providerDiversity}`);
    const latCol = col(`${r.latencyMs}ms`);
    const excCol = col(r.hasExcludedTopics ? `<span style="color:#ef4444;">⚠️</span>` : `<span style="color:#22c55e;">✓</span>`);

    let violationHtml = "";
    if (hasViolations) {
      violationHtml = violations.map((v) => `<span class="vb">${v.metric}: ${v.actual} < ${v.expected}</span>`).join(" ");
    }

    return `<tr>
      ${nameCol}
      ${p5Col}
      ${n5Col}
      ${mrrCol}
      ${divCol}
      ${latCol}
      ${excCol}
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${hasViolations ? violationHtml : '<span style="color:#22c55e;">✓ All good</span>'}</td>
    </tr>`;
  }).join("\n");

  const advPassed = report.adversarialResults.filter((a) => a.passed).length;
  const advRows = report.adversarialResults.map((a) => {
    const color = a.passed ? "#22c55e" : "#ef4444";
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${a.caseId}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${a.name}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:${color};font-weight:600;">${a.passed ? "PASS" : "FAIL"}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;">${a.latencyMs}ms</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${a.details ?? ""}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Verix Quality Report — ${report.runId}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f1f5f9; color:#1e293b; }
.header { background:linear-gradient(135deg,#0f172a,#1e293b,#334155); color:#fff; padding:40px; }
.header h1 { font-size:28px; font-weight:700; letter-spacing:-0.5px; }
.header .meta { margin-top:8px; color:#94a3b8; font-size:14px; }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:16px; margin-top:24px; }
.card { background:rgba(255,255,255,0.08); backdrop-filter:blur(8px); border-radius:12px; padding:20px; text-align:center; border:1px solid rgba(255,255,255,0.05); }
.card .val { font-size:30px; font-weight:700; }
.card .lbl { font-size:12px; color:#94a3b8; margin-top:4px; text-transform:uppercase; letter-spacing:0.5px; }
.verdict { display:inline-block; padding:6px 20px; border-radius:20px; font-weight:700; font-size:14px; margin-top:12px; text-transform:uppercase; letter-spacing:1px; }
.section { background:#fff; border-radius:16px; margin:20px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
.section h2 { font-size:18px; color:#0f172a; margin-bottom:16px; display:flex; align-items:center; gap:8px; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; padding:10px 12px; border-bottom:2px solid #e2e8f0; color:#64748b; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; }
.vb { display:inline-block; background:#fef2f2; color:#dc2626; padding:2px 8px; border-radius:4px; font-size:11px; margin:1px; white-space:nowrap; }
.footer { text-align:center; padding:24px; color:#94a3b8; font-size:12px; }
</style>
</head>
<body>
<div class="header">
  <h1>🔍 Verix Search Quality Report</h1>
  <div class="meta">Run: ${report.runId} · ${report.timestamp} · v${report.version}</div>
  <div style="margin-top:4px;">
    <span class="verdict" style="background:${passColor}20;color:${passColor};border:1px solid ${passColor}40;">${report.recommendation.toUpperCase()}</span>
  </div>
  <div class="cards">
    <div class="card"><div class="val" style="color:${passColor};">${s.overallScore.toFixed(0)}</div><div class="lbl">Quality Score</div></div>
    <div class="card"><div class="val">${s.totalQueries > 0 ? ((s.passedQueries / s.totalQueries) * 100).toFixed(0) : 0}%</div><div class="lbl">Query Pass Rate</div></div>
    <div class="card"><div class="val">${advPassed}/${report.adversarialResults.length}</div><div class="lbl">Adversarial</div></div>
    <div class="card"><div class="val">${s.avgLatencyMs.toFixed(0)}ms</div><div class="lbl">Avg Latency</div></div>
    <div class="card"><div class="val">${(s.determinismRate * 100).toFixed(0)}%</div><div class="lbl">Determinism</div></div>
  </div>
</div>

<div class="section">
  <h2>📊 Aggregate Metrics</h2>
  <table>
    <tr><th>Metric</th><th>Value</th><th>Target</th><th style="text-align:center;">Status</th></tr>
    ${aggMetrics}
  </table>
</div>

<div class="section">
  <h2>📋 Per-Query Results</h2>
  <table>
    <tr>
      <th style="min-width:200px;">Query</th><th>P@5</th><th>NDCG@5</th><th>MRR</th><th>Div</th><th>Latency</th><th>Excl</th><th>Violations</th>
    </tr>
    ${resultRows}
  </table>
</div>

<div class="section">
  <h2>🧪 Adversarial Tests (${advPassed}/${report.adversarialResults.length} passed)</h2>
  <table>
    <tr><th>ID</th><th>Name</th><th>Result</th><th>Latency</th><th>Details</th></tr>
    ${advRows}
  </table>
</div>

<div class="footer">Verix Search · Quality Report · Generated ${report.timestamp}</div>
</body>
</html>`;
}

export function saveReport(report: QualityReport, outputDir: string = "./reports"): string {
  const html = generateHtmlReport(report);
  const filename = `quality-report-${report.runId}.html`;
  const filepath = path.join(outputDir, filename);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filepath, html, "utf-8");
  return filepath;
}

export function printReportSummary(report: QualityReport): void {
  const s = report.summary;
  const passRate = s.totalQueries > 0 ? ((s.passedQueries / s.totalQueries) * 100).toFixed(0) : "0";
  const advPassed = report.adversarialResults.filter((r) => r.passed).length;
  const advRate = report.adversarialResults.length > 0 ? ((advPassed / report.adversarialResults.length) * 100).toFixed(0) : "0";

  console.log("\n═══════════════════════════════════════════");
  console.log("  VERIX SEARCH — QUALITY REPORT");
  console.log(`  Run: ${report.runId} · ${report.timestamp}`);
  console.log("───────────────────────────────────────────");
  console.log(`  Score: ${s.overallScore.toFixed(0)}/100 · Pass: ${passRate}% · Adv: ${advRate}% · ${report.recommendation.toUpperCase()}`);
  console.log("───────────────────────────────────────────");
  console.log(`  P@5:    ${(s.avgPrecisionAt5 * 100).toFixed(1)}%   N@5:  ${(s.avgNdcgAt5 * 100).toFixed(1)}%   MRR:  ${(s.avgMrr * 100).toFixed(1)}%`);
  console.log(`  P@10:   ${(s.avgPrecisionAt10 * 100).toFixed(1)}%   N@10: ${(s.avgNdcgAt10 * 100).toFixed(1)}%   Div:  ${s.avgProviderDiversity.toFixed(1)}`);
  console.log(`  MAP@10: ${(s.avgMapAt10 * 100).toFixed(1)}%   Bpref: ${(s.avgBpref * 100).toFixed(1)}%   Lat:  ${s.avgLatencyMs.toFixed(0)}ms`);
  console.log(`  Det:    ${(s.determinismRate * 100).toFixed(0)}%   Deg:  ${(s.degradedRate * 100).toFixed(1)}%   Excl: ${s.excludedTopicViolations}`);
  console.log("───────────────────────────────────────────");
  for (const r of s.results) {
    const pass = r.precisionAt5 >= report.thresholds.precisionAt5 && r.ndcgAt5 >= report.thresholds.ndcgAt5 && !r.hasExcludedTopics;
    console.log(`  ${pass ? "✅" : "❌"} ${r.queryId}: P@5=${(r.precisionAt5 * 100).toFixed(0)}% N@5=${(r.ndcgAt5 * 100).toFixed(0)}% MRR=${(r.mrr * 100).toFixed(0)}% Div=${r.providerDiversity} ${r.latencyMs}ms${r.hasExcludedTopics ? " ⚠️EX" : ""}`);
  }
  console.log(`\n  🧪 Adversarial: ${advPassed}/${report.adversarialResults.length} (${advRate}%)`);
  console.log(`  📄 Trend: reports/.trends.json (${report.summary.overallScore.toFixed(0)}/100)`);
  if (report.recommendation === "block") console.log("\n  ⛔ BLOCK: Thresholds not met.");
  else if (report.recommendation === "warn") console.log("\n  ⚠️  WARN: Degraded but acceptable.");
  else console.log("\n  ✅ PASS: All thresholds met.");
  console.log("═══════════════════════════════════════════\n");
}
