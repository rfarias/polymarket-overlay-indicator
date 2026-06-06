import fs from "node:fs/promises";
import path from "node:path";
import { ExhaustionBacktestReport, ExhaustionTrade } from "./types.js";

export async function writeExhaustionReport(report: ExhaustionBacktestReport, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "exhaustion-reversal-report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outputDir, "exhaustion-reversal-trades.csv"), tradesCsv(report.trades));
  await fs.writeFile(path.join(outputDir, "exhaustion-reversal-report.html"), htmlReport(report));
}

export function printExhaustionSummary(report: ExhaustionBacktestReport): void {
  const rows = report.summaries
    .filter((row) => row.trades > 0)
    .sort((a, b) => b.evPerTrade - a.evPerTrade)
    .slice(0, 12)
    .map((row) => ({
      setup: row.parameterName,
      trades: row.trades,
      winRate: `${(row.winRate * 100).toFixed(1)}%`,
      avgEntry: row.avgEntryPrice.toFixed(3),
      ev: row.evPerTrade.toFixed(4),
      pnl: row.totalPnl.toFixed(4),
      maxDD: row.maxDrawdown.toFixed(4)
    }));
  console.table(rows);
}

function tradesCsv(trades: ExhaustionTrade[]): string {
  const columns: Array<keyof ExhaustionTrade> = [
    "parameterName",
    "marketId",
    "slug",
    "signalTimeMs",
    "secondsRemaining",
    "priceToBeat",
    "priceNow",
    "dominantSide",
    "sideBought",
    "entryPrice",
    "finalResult",
    "win",
    "grossPnl",
    "netPnl",
    "dataQuality",
    "zPrice",
    "zReturn",
    "zVolume",
    "aggressionRatio",
    "distanceBps",
    "distanceSigma",
    "requiredVelocity"
  ];
  return [
    columns.join(","),
    ...trades.map((trade) => columns.map((column) => csvValue(trade[column])).join(","))
  ].join("\n");
}

function htmlReport(report: ExhaustionBacktestReport): string {
  const summaryRows = report.summaries
    .filter((row) => row.trades > 0)
    .sort((a, b) => b.evPerTrade - a.evPerTrade)
    .map((row) => `<tr><td>${escapeHtml(row.parameterName)}</td><td>${row.trades}</td><td>${pct(row.winRate)}</td><td>${row.avgEntryPrice.toFixed(3)}</td><td>${row.evPerTrade.toFixed(4)}</td><td>${row.totalPnl.toFixed(4)}</td><td>${row.maxDrawdown.toFixed(4)}</td><td>${row.profitFactor.toFixed(2)}</td></tr>`)
    .join("");
  const tradesRows = report.trades
    .sort((a, b) => b.netPnl - a.netPnl)
    .slice(0, 50)
    .map((trade) => `<tr><td>${escapeHtml(trade.parameterName)}</td><td>${escapeHtml(trade.slug)}</td><td>${new Date(trade.signalTimeMs).toISOString()}</td><td>${trade.sideBought}</td><td>${trade.entryPrice.toFixed(3)}</td><td>${trade.win ? "win" : "loss"}</td><td>${trade.netPnl.toFixed(4)}</td><td>${trade.distanceBps.toFixed(2)}</td><td>${trade.zPrice?.toFixed(2) ?? ""}</td></tr>`)
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Exhaustion Reversal Backtest</title>
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
  <h1>Exhaustion Reversal Backtest</h1>
  <p>Gerado em ${escapeHtml(report.generatedAt)}.</p>
  <ul class="notes">${report.sourceNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  <h2>Performance por Setup</h2>
  <table><thead><tr><th>Setup</th><th>Trades</th><th>Win rate</th><th>Entrada media</th><th>EV/trade</th><th>PnL</th><th>Max DD</th><th>PF</th></tr></thead><tbody>${summaryRows}</tbody></table>
  <h2>Melhores/Piores Trades</h2>
  <table><thead><tr><th>Setup</th><th>Slug</th><th>Timestamp</th><th>Lado</th><th>Entrada</th><th>Resultado</th><th>PnL</th><th>Dist bps</th><th>Z price</th></tr></thead><tbody>${tradesRows}</tbody></table>
</body>
</html>`;
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
