import fs from "node:fs/promises";
import path from "node:path";
import { DistanceToBeatBucket, DistanceToBeatReport } from "./types.js";

export async function writeDistanceToBeatReport(report: DistanceToBeatReport, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "distance-to-beat-report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outputDir, "distance-to-beat-buckets.csv"), bucketsCsv(report.buckets));
  await fs.writeFile(path.join(outputDir, "distance-to-beat-report.html"), htmlReport(report));
}

export function printDistanceToBeatSummary(report: DistanceToBeatReport): void {
  console.log("Best reversal buckets");
  console.table(report.bestReversalBuckets.slice(0, 10).map(tableRow("reversal")));
  console.log("Best dominant buckets");
  console.table(report.bestDominantBuckets.slice(0, 10).map(tableRow("dominant")));
}

function bucketsCsv(rows: DistanceToBeatBucket[]): string {
  const columns: Array<keyof DistanceToBeatBucket> = [
    "bucketType",
    "bucketKey",
    "samples",
    "upWins",
    "downWins",
    "upWinRate",
    "downWinRate",
    "dominantWinRate",
    "reversalWinRate",
    "avgUpAsk",
    "avgDownAsk",
    "avgDominantAsk",
    "avgReversalAsk",
    "upNetEdge",
    "downNetEdge",
    "dominantNetEdge",
    "reversalNetEdge",
    "avgSecondsRemaining",
    "avgDistanceUsd",
    "avgDistanceBps",
    "avgDistanceSigma",
    "avgRequiredVelocity",
    "dataQuality",
    "sampleQuality"
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n");
}

function htmlReport(report: DistanceToBeatReport): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Distance to Price to Beat</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0 28px; font-size: 13px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: right; }
    th:first-child, td:first-child, td:nth-child(2) { text-align: left; }
    th { background: #f3f4f6; }
    .notes { color: #4b5563; }
  </style>
</head>
<body>
  <h1>Distance to Price to Beat</h1>
  <p>Gerado em ${escapeHtml(report.generatedAt)}. Observacoes: ${report.observations}. Mercados: ${report.markets}.</p>
  <ul class="notes">${report.sourceNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  <h2>Melhores buckets de reversao</h2>
  ${table(report.bestReversalBuckets, "reversal")}
  <h2>Melhores buckets de dominancia</h2>
  ${table(report.bestDominantBuckets, "dominant")}
</body>
</html>`;
}

function table(rows: DistanceToBeatBucket[], mode: "dominant" | "reversal"): string {
  const body = rows.map((row) => `<tr><td>${escapeHtml(row.bucketType)}</td><td>${escapeHtml(row.bucketKey)}</td><td>${row.samples}</td><td>${pct(mode === "dominant" ? row.dominantWinRate : row.reversalWinRate)}</td><td>${formatNumber(mode === "dominant" ? row.avgDominantAsk : row.avgReversalAsk)}</td><td>${formatNumber(mode === "dominant" ? row.dominantNetEdge : row.reversalNetEdge)}</td><td>${row.avgDistanceBps.toFixed(2)}</td><td>${formatNumber(row.avgDistanceSigma)}</td><td>${escapeHtml(row.dataQuality)}</td></tr>`).join("");
  return `<table><thead><tr><th>Tipo</th><th>Bucket</th><th>Amostras</th><th>Win rate</th><th>Ask medio</th><th>Edge liquido</th><th>Dist bps</th><th>Dist sigma</th><th>Qualidade</th></tr></thead><tbody>${body}</tbody></table>`;
}

function tableRow(mode: "dominant" | "reversal") {
  return (row: DistanceToBeatBucket): Record<string, string | number> => ({
    tipo: row.bucketType,
    bucket: row.bucketKey,
    samples: row.samples,
    winRate: pct(mode === "dominant" ? row.dominantWinRate : row.reversalWinRate),
    avgAsk: formatNumber(mode === "dominant" ? row.avgDominantAsk : row.avgReversalAsk),
    netEdge: formatNumber(mode === "dominant" ? row.dominantNetEdge : row.reversalNetEdge),
    distBps: row.avgDistanceBps.toFixed(2),
    distSigma: formatNumber(row.avgDistanceSigma),
    quality: row.dataQuality
  });
}

function csvValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "" : value.toFixed(4);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
