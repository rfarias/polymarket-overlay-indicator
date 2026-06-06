import fs from "node:fs/promises";
import path from "node:path";
import { OddsCalibrationBucket, OddsCalibrationReport } from "./types.js";

export async function writeOddsCalibrationReport(report: OddsCalibrationReport, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "odds-calibration-report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outputDir, "odds-calibration-buckets.csv"), bucketsCsv(report.buckets));
  await fs.writeFile(path.join(outputDir, "odds-calibration-report.html"), htmlReport(report));
}

export function printOddsCalibrationSummary(report: OddsCalibrationReport): void {
  console.table(report.bestBuckets.slice(0, 12).map(tableRow));
}

function bucketsCsv(rows: OddsCalibrationBucket[]): string {
  const columns: Array<keyof OddsCalibrationBucket> = [
    "bucketType",
    "bucketKey",
    "samples",
    "wins",
    "winRate",
    "avgOdd",
    "avgNetEntry",
    "grossEdge",
    "netEdge",
    "calibrationError",
    "brierScore",
    "avgSecondsRemaining",
    "avgDistanceBps",
    "avgDistanceSigma",
    "dataQuality",
    "sampleQuality"
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n");
}

function htmlReport(report: OddsCalibrationReport): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Polymarket Odds Calibration</title>
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
  <h1>Polymarket Odds Calibration</h1>
  <p>Gerado em ${escapeHtml(report.generatedAt)}. Observacoes: ${report.observations}. Mercados: ${report.markets}.</p>
  <ul class="notes">${report.sourceNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  <h2>Melhores buckets com amostra minima</h2>
  ${table(report.bestBuckets)}
  <h2>Piores buckets com amostra minima</h2>
  ${table(report.worstBuckets)}
</body>
</html>`;
}

function table(rows: OddsCalibrationBucket[]): string {
  const body = rows.map((row) => `<tr><td>${escapeHtml(row.bucketType)}</td><td>${escapeHtml(row.bucketKey)}</td><td>${row.samples}</td><td>${pct(row.winRate)}</td><td>${row.avgOdd.toFixed(3)}</td><td>${row.netEdge.toFixed(4)}</td><td>${row.brierScore.toFixed(4)}</td><td>${escapeHtml(row.dataQuality)}</td></tr>`).join("");
  return `<table><thead><tr><th>Tipo</th><th>Bucket</th><th>Amostras</th><th>Win rate</th><th>Odd media</th><th>Edge liquido</th><th>Brier</th><th>Qualidade</th></tr></thead><tbody>${body}</tbody></table>`;
}

function tableRow(row: OddsCalibrationBucket): Record<string, string | number> {
  return {
    tipo: row.bucketType,
    bucket: row.bucketKey,
    samples: row.samples,
    winRate: pct(row.winRate),
    avgOdd: row.avgOdd.toFixed(3),
    netEdge: row.netEdge.toFixed(4),
    brier: row.brierScore.toFixed(4),
    quality: row.dataQuality
  };
}

function csvValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
