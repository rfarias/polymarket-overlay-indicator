import fs from "node:fs/promises";
import path from "node:path";
import { getArgValue } from "../utils/args.js";
import { ExhaustionBacktestDataset } from "../strategies/exhaustionReversal/index.js";
import {
  defaultSetupCatalog,
  printSetupBacktestSummary,
  runSetupBacktest,
  writeSetupBacktestReport
} from "../strategies/setupBacktest/index.js";

const args = process.argv.slice(2);
const input = getArgValue(args, "--input");
const outputDir = path.resolve(getArgValue(args, "--output-dir", "research-output/setup-backtests")!);

if (!input) {
  console.error("Uso: npm run setup-backtest -- --input data/external-btc5/combined...binance-enriched.json [--output-dir research-output/setup-backtests/run]");
  process.exit(1);
}

const raw = await fs.readFile(path.resolve(input), "utf8");
const dataset = JSON.parse(raw) as ExhaustionBacktestDataset;
const setups = defaultSetupCatalog();
const report = runSetupBacktest(dataset, setups);
await writeSetupBacktestReport(report, outputDir);
printSetupBacktestSummary(report);
console.log(JSON.stringify({
  ok: true,
  input: path.resolve(input),
  outputDir,
  markets: dataset.markets.length,
  btcPrices: dataset.btcPrices.length,
  odds: dataset.odds.length,
  setups: setups.length,
  trades: report.trades.length,
  bestSetups: report.bestSetups.length
}, null, 2));
