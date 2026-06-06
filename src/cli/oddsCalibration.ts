import fs from "node:fs/promises";
import path from "node:path";
import { getArgValue, getNumberArg } from "../utils/args.js";
import { ExhaustionBacktestDataset } from "../strategies/exhaustionReversal/index.js";
import {
  printOddsCalibrationSummary,
  runOddsCalibration,
  writeOddsCalibrationReport
} from "../strategies/oddsCalibration/index.js";

const args = process.argv.slice(2);
const input = getArgValue(args, "--input");
const outputDir = path.resolve(getArgValue(args, "--output-dir", "research-output/odds-calibration")!);
const slippagePrice = getNumberArg(args, "--slippage-price", 0.01);
const minSamples = getNumberArg(args, "--min-samples", 30);
const distanceVolWindowSec = getNumberArg(args, "--distance-vol-window-sec", 60);

if (!input) {
  console.error("Uso: npm run odds-calibration -- --input data/exhaustion-reversal/.../dataset.json [--output-dir research-output/odds-calibration]");
  process.exit(1);
}

const raw = await fs.readFile(path.resolve(input), "utf8");
const dataset = JSON.parse(raw) as ExhaustionBacktestDataset;
const report = runOddsCalibration(dataset, { slippagePrice, minSamples, distanceVolWindowSec });
await writeOddsCalibrationReport(report, outputDir);
printOddsCalibrationSummary(report);
console.log(JSON.stringify({
  ok: true,
  markets: report.markets,
  observations: report.observations,
  buckets: report.buckets.length,
  bestBuckets: report.bestBuckets.length,
  outputDir
}, null, 2));
