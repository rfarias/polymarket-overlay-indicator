import fs from "node:fs/promises";
import path from "node:path";
import { getArgValue, hasFlag } from "../utils/args.js";
import {
  defaultExhaustionParameterGrid,
  ExhaustionBacktestDataset,
  namedExhaustionSetups,
  printExhaustionSummary,
  runExhaustionBacktest,
  writeExhaustionReport
} from "../strategies/exhaustionReversal/index.js";

const args = process.argv.slice(2);
const input = getArgValue(args, "--input");
const outputDir = path.resolve(getArgValue(args, "--output-dir", "research-output/exhaustion-reversal")!);
const gridMode = hasFlag(args, "--grid");

if (!input) {
  console.error("Uso: npm run exhaustion-reversal-backtest -- --input data/exhaustion-dataset.json [--grid] [--output-dir research-output/exhaustion-reversal]");
  process.exit(1);
}

const raw = await fs.readFile(path.resolve(input), "utf8");
const dataset = JSON.parse(raw) as ExhaustionBacktestDataset;
const params = gridMode ? defaultExhaustionParameterGrid() : namedExhaustionSetups();
const report = runExhaustionBacktest(dataset, params);
await writeExhaustionReport(report, outputDir);
printExhaustionSummary(report);
console.log(JSON.stringify({
  ok: true,
  markets: dataset.markets.length,
  btcPrices: dataset.btcPrices.length,
  odds: dataset.odds.length,
  parameterSets: params.length,
  trades: report.trades.length,
  outputDir
}, null, 2));
