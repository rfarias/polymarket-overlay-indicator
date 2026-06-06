import fs from "node:fs/promises";
import path from "node:path";
import { ExhaustionBacktestDataset } from "../strategies/exhaustionReversal/index.js";
import {
  printDistanceToBeatSummary,
  runDistanceToBeatStudy,
  writeDistanceToBeatReport
} from "../strategies/distanceToBeat/index.js";
import { getArgValue, getNumberArg } from "../utils/args.js";

const args = process.argv.slice(2);
const input = getArgValue(args, "--input");
const outputDir = path.resolve(getArgValue(args, "--output-dir", "research-output/distance-to-beat")!);
const minSamples = getNumberArg(args, "--min-samples", 30);
const volatilityWindowSec = getNumberArg(args, "--volatility-window-sec", 60);
const slippagePrice = getNumberArg(args, "--slippage-price", 0.01);

if (!input) {
  console.error("Uso: npm run distance-to-beat -- --input data/exhaustion-reversal/.../dataset.json [--output-dir research-output/distance-to-beat]");
  process.exit(1);
}

const raw = await fs.readFile(path.resolve(input), "utf8");
const dataset = JSON.parse(raw) as ExhaustionBacktestDataset;
const report = runDistanceToBeatStudy(dataset, { minSamples, volatilityWindowSec, slippagePrice });
await writeDistanceToBeatReport(report, outputDir);
printDistanceToBeatSummary(report);
console.log(JSON.stringify({
  ok: true,
  markets: report.markets,
  observations: report.observations,
  buckets: report.buckets.length,
  bestReversalBuckets: report.bestReversalBuckets.length,
  bestDominantBuckets: report.bestDominantBuckets.length,
  outputDir
}, null, 2));
