import fs from "node:fs/promises";
import path from "node:path";
import { SetupBacktestReport, SetupSummary, SetupTrade } from "./types.js";

interface PeriodSummary {
  period: string;
  setupName: string;
  family: string;
  trades: number;
  wins: number;
  winRate: number;
  avgEntryPrice: number;
  evPerTrade: number;
  totalPnl: number;
}

export async function writeSetupBacktestReport(report: SetupBacktestReport, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "setup-backtest-report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outputDir, "setup-backtest-summary.csv"), summaryCsv(report.summaries));
  await fs.writeFile(path.join(outputDir, "setup-backtest-period-summary.csv"), periodSummaryCsv(periodSummaries(report.trades)));
  await fs.writeFile(path.join(outputDir, "setup-backtest-trades.csv"), tradesCsv(report.trades));
  await fs.writeFile(path.join(outputDir, "setup-backtest-report.md"), markdownReport(report));
}

export function printSetupBacktestSummary(report: SetupBacktestReport): void {
  console.table(report.summaries
    .filter((row) => row.trades > 0)
    .sort((a, b) => b.evPerTrade - a.evPerTrade)
    .map((row) => ({
      setup: row.setupName,
      family: row.family,
      trades: row.trades,
      winRate: pct(row.winRate),
      avgEntry: row.avgEntryPrice.toFixed(3),
      ev: row.evPerTrade.toFixed(4),
      roi: pct(row.roi),
      pnl: row.totalPnl.toFixed(3),
      maxDD: row.maxDrawdown.toFixed(3),
      quality: row.dataQuality
    })));
}

function summaryCsv(rows: SetupSummary[]): string {
  const columns: Array<keyof SetupSummary> = [
    "setupName",
    "family",
    "trades",
    "wins",
    "winRate",
    "avgEntryPrice",
    "evPerTrade",
    "roi",
    "totalPnl",
    "maxDrawdown",
    "profitFactor",
    "avgSecondsRemaining",
    "avgDistanceBps",
    "avgDistanceSigma",
    "avgCrossesInWindow",
    "avgSecondsSinceLastCross",
    "avgMomentumBps",
    "dataQuality"
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n");
}

function tradesCsv(rows: SetupTrade[]): string {
  const columns: Array<keyof SetupTrade> = [
    "setupName",
    "family",
    "marketId",
    "slug",
    "signalTimeMs",
    "secondsRemaining",
    "sideBought",
    "dominantSide",
    "finalResult",
    "win",
    "entryAsk",
    "entryPrice",
    "netPnl",
    "priceNow",
    "priceToBeat",
    "signedDistanceBps",
    "distanceBps",
    "distanceSigma",
    "requiredVelocity",
    "crossesInWindow",
    "secondsSinceLastCross",
    "lastCrossDirection",
    "momentumBps",
    "dataQuality"
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n");
}

function markdownReport(report: SetupBacktestReport): string {
  const sorted = [...report.summaries].sort((a, b) => b.evPerTrade - a.evPerTrade);
  const periods = periodSummaries(report.trades).sort((a, b) =>
    a.setupName.localeCompare(b.setupName) || a.period.localeCompare(b.period)
  );
  return [
    "# Setup Backtest Report",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Source Notes",
    "",
    ...report.sourceNotes.map((note) => `- ${note}`),
    "",
    "## Summary",
    "",
    "| Setup | Family | Trades | Win rate | Avg entry | EV/trade | ROI | PnL | Max DD | Quality |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ...sorted.map((row) =>
      `| ${row.setupName} | ${row.family} | ${row.trades} | ${pct(row.winRate)} | ${row.avgEntryPrice.toFixed(3)} | ${row.evPerTrade.toFixed(4)} | ${pct(row.roi)} | ${row.totalPnl.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.dataQuality} |`
    ),
    "",
    "## Period Breakdown",
    "",
    "| Period | Setup | Trades | Win rate | Avg entry | EV/trade | PnL |",
    "|---|---|---:|---:|---:|---:|---:|",
    ...periods.map((row) =>
      `| ${row.period} | ${row.setupName} | ${row.trades} | ${pct(row.winRate)} | ${row.avgEntryPrice.toFixed(3)} | ${row.evPerTrade.toFixed(4)} | ${row.totalPnl.toFixed(3)} |`
    ),
    "",
    "## Interpretation",
    "",
    "- Treat this as setup triage. A positive EV row needs out-of-sample validation and source-quality review.",
    "- Reversal controls are intentionally included to verify that the framework does not only surface positive-looking ideas.",
    ""
  ].join("\n");
}

function periodSummaries(trades: SetupTrade[]): PeriodSummary[] {
  const groups = new Map<string, SetupTrade[]>();
  for (const trade of trades) {
    const period = new Date(trade.signalTimeMs).toISOString().slice(0, 7);
    const key = `${period}|${trade.setupName}`;
    const rows = groups.get(key) ?? [];
    rows.push(trade);
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [period, setupName] = key.split("|");
    const wins = rows.filter((row) => row.win).length;
    const totalPnl = rows.reduce((sum, row) => sum + row.netPnl, 0);
    const entryCost = rows.reduce((sum, row) => sum + row.entryPrice, 0);
    return {
      period: period ?? "",
      setupName: setupName ?? "",
      family: rows[0]?.family ?? "",
      trades: rows.length,
      wins,
      winRate: rows.length ? wins / rows.length : 0,
      avgEntryPrice: rows.length ? entryCost / rows.length : 0,
      evPerTrade: rows.length ? totalPnl / rows.length : 0,
      totalPnl
    };
  });
}

function periodSummaryCsv(rows: PeriodSummary[]): string {
  const columns: Array<keyof PeriodSummary> = [
    "period",
    "setupName",
    "family",
    "trades",
    "wins",
    "winRate",
    "avgEntryPrice",
    "evPerTrade",
    "totalPnl"
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n");
}

function csvValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
