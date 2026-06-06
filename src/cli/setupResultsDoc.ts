import fs from "node:fs/promises";
import path from "node:path";
import { getArgValue } from "../utils/args.js";
import { SetupBacktestReport, SetupSummary } from "../strategies/setupBacktest/index.js";

const args = process.argv.slice(2);
const input = getArgValue(args, "--input");
const output = getArgValue(args, "--output");

if (!input || !output) {
  console.error("Uso: npm run setup-results-doc -- --input research-output/setup-backtests/.../setup-backtest-report.json --output docs/setup-results.md");
  process.exit(1);
}

const report = JSON.parse(await fs.readFile(path.resolve(input), "utf8")) as SetupBacktestReport;
const lines = render(report);
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(path.resolve(output), lines.join("\n"));

console.log(JSON.stringify({
  ok: true,
  input: path.resolve(input),
  output: path.resolve(output),
  setups: report.summaries.length,
  trades: report.trades.length
}, null, 2));

function render(report: SetupBacktestReport): string[] {
  const byName = new Map(report.setups.map((setup) => [setup.name, setup]));
  const rows = [...report.summaries].sort((a, b) => b.evPerTrade - a.evPerTrade);
  return [
    "# Setup Results - BTC 5m",
    "",
    `Generated from: \`research-output/setup-backtests/combined-local-btc5-binance-1s/setup-backtest-report.json\``,
    `Backtest generated at: ${report.generatedAt}`,
    "",
    "## Executive Read",
    "",
    `- Setups implemented/tested: ${report.summaries.length}`,
    `- Total simulated trades across all setups: ${report.trades.length}`,
    "- Data quality: `EXCHANGE_PROXY`; Binance-enriched `priceToBeat`/BTC series, not Chainlink/Data Streams ground truth.",
    "- Current sample size is too small for proof. Treat every positive EV result as a hypothesis.",
    "- Practical evidence thresholds used here: `<100 trades = exploratory`, `100-999 = preliminary`, `1,000-9,999 = stronger`, `10,000+ = robust if stable out of sample`.",
    "",
    "## Ranking",
    "",
    "| # | Setup | Family | Trades | Evidence | Win rate | Avg entry | EV/trade | ROI | PnL | Max DD | Verdict |",
    "|---:|---|---|---:|---|---:|---:|---:|---:|---:|---:|---|",
    ...rows.map((row, index) =>
      `| ${index + 1} | ${row.setupName} | ${row.family} | ${row.trades} | ${evidence(row.trades)} | ${pct(row.winRate)} | ${num(row.avgEntryPrice)} | ${signed(row.evPerTrade)} | ${pct(row.roi)} | ${signed(row.totalPnl)} | ${num(row.maxDrawdown)} | ${verdict(row)} |`
    ),
    "",
    "## Individual Results",
    "",
    ...rows.flatMap((row) => {
      const setup = byName.get(row.setupName);
      return [
        `### ${row.setupName}`,
        "",
        `Family: \`${row.family}\``,
        "",
        `Rule: ${setup?.description ?? "Description unavailable."}`,
        "",
        `Result: ${row.trades} trades, ${pct(row.winRate)} win rate, avg entry ${num(row.avgEntryPrice)}, EV/trade ${signed(row.evPerTrade)}, ROI ${pct(row.roi)}, total PnL ${signed(row.totalPnl)}, max drawdown ${num(row.maxDrawdown)}.`,
        "",
        `Evidence: ${evidence(row.trades)}. ${evidenceText(row.trades)}`,
        "",
        `Verdict: ${verdict(row)}.`,
        "",
        `Notes: ${notes(row)}`,
        ""
      ];
    }),
    "## What This Means",
    "",
    "- The current base is useful to reject weak ideas and rank hypotheses.",
    "- It is not enough to claim a production edge.",
    "- Dominance/continuation setups are consistently better than reversal setups in this sample.",
    "- Reversal setups are mostly negative or weak after slippage.",
    "- The next priority is more data, then out-of-sample validation and walk-forward splits.",
    "",
    "## Required Sample Sizes",
    "",
    "- 100 trades: minimum sanity check; still very noisy.",
    "- 1,000 trades: useful early confidence if EV persists across periods.",
    "- 10,000 trades: closer to robust, provided source quality, fills, latency and slippage are modeled realistically.",
    "",
    "## Missing From The Claimed 25",
    "",
    "The current executable setup catalog contains 21 implemented setups. If the intended list is 25, 4 setups are still not formalized in `src/strategies/setupBacktest/setupCatalog.ts`, so there is no honest result to report for them yet.",
    "",
    "Next implementation should either add the 4 missing definitions explicitly or generate the remaining variants from a parameter grid and mark them as exploratory.",
    ""
  ];
}

function evidence(trades: number): string {
  if (trades >= 10_000) return "ROBUST";
  if (trades >= 1_000) return "STRONGER";
  if (trades >= 100) return "PRELIMINARY";
  return "EXPLORATORY";
}

function evidenceText(trades: number): string {
  if (trades >= 10_000) return "Large enough for serious review if stable across periods.";
  if (trades >= 1_000) return "Enough for meaningful review, but still needs regime and out-of-sample checks.";
  if (trades >= 100) return "Potentially useful, but still below robust confidence.";
  return "Too few trades for confidence; use only for ranking hypotheses.";
}

function verdict(row: SetupSummary): string {
  if (row.trades < 100 && row.evPerTrade > 0) return "positive but under-sampled";
  if (row.evPerTrade > 0.02 && row.trades >= 100) return "candidate";
  if (row.evPerTrade > 0) return "weak positive";
  if (row.evPerTrade > -0.01) return "near flat";
  return "reject for now";
}

function notes(row: SetupSummary): string {
  if (row.trades < 100 && row.evPerTrade > 0) return "Do not treat as proven EV+; prioritize collecting more examples.";
  if (row.evPerTrade < 0) return "Negative after slippage in this sample.";
  if (row.family.includes("reversal")) return "Reversal-family result should be held to a higher bar because most reversal controls failed.";
  return "Candidate for larger-sample validation.";
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "" : value.toFixed(4);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}
