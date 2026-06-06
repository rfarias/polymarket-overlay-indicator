import path from "node:path";
import { ExhaustionReversalCollector } from "../services/exhaustionReversalCollector.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const seconds = getNumberArg(args, "--seconds", 1800);
const pollSecs = getNumberArg(args, "--poll-secs", 2);
const asset = getArgValue(args, "--asset", "btc")!.toLowerCase();
const symbol = getArgValue(args, "--symbol", "BTCUSDT")!.toUpperCase();
const outputDir = path.resolve(getArgValue(args, "--output-dir", `data/exhaustion-reversal/${new Date().toISOString().replace(/[:.]/g, "-")}`)!);
const includeSignals = !hasFlag(args, "--no-signals");
const json = hasFlag(args, "--json");

const report = await new ExhaustionReversalCollector().run({
  seconds,
  pollSecs,
  outputDir,
  symbol,
  asset,
  includeSignals
});

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Exhaustion reversal collector");
  console.table([report]);
}
