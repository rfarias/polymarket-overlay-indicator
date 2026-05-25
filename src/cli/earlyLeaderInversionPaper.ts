import { EarlyLeaderInversionPaperService } from "../services/earlyLeaderInversionPaperService.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const seconds = getNumberArg(args, "--seconds", 300);
const pollSecs = getNumberArg(args, "--poll-secs", 2);
const stake = getNumberArg(args, "--stake", 10);
const minEarlyLeaderBid = getNumberArg(args, "--min-early-leader-bid", 0.55);
const minNewLeaderBid = getNumberArg(args, "--min-new-leader-bid", 0.6);
const maxNewLeaderBid = getNumberArg(args, "--max-new-leader-bid", 0.72);
const minFlipGap = getNumberArg(args, "--min-flip-gap", 0.03);
const maxEntryAsk = getNumberArg(args, "--max-entry-ask", 0.78);
const minSecondsToEnd = getNumberArg(args, "--min-seconds-to-end", 60);
const maxSecondsToEnd = getNumberArg(args, "--max-seconds-to-end", 180);
const takeProfitBid = getNumberArg(args, "--take-profit-bid", 0.85);
const stopBid = getNumberArg(args, "--stop-bid", 0.45);
const exitSecondsToEnd = getNumberArg(args, "--exit-seconds-to-end", 5);
const assets = getArgValue(args, "--assets", "btc,eth,sol,xrp,doge,bnb")!
  .split(",")
  .map((asset) => asset.trim().toLowerCase())
  .filter(Boolean);
const minAbsDistanceToBeatBps = getNumberArg(args, "--min-abs-distance-to-beat-bps", 0);
const maxAbsDistanceToBeatBps = getNumberArg(args, "--max-abs-distance-to-beat-bps", Number.POSITIVE_INFINITY);
const minRecentVolatilityBps = getNumberArg(args, "--min-recent-volatility-bps", 0);
const maxRecentVolatilityBps = getNumberArg(args, "--max-recent-volatility-bps", Number.POSITIVE_INFINITY);
const logFile = getArgValue(args, "--log-file", `logs/el_inversion_paper_${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`)!;
const json = hasFlag(args, "--json");

const report = await new EarlyLeaderInversionPaperService().run({
  seconds,
  pollSecs,
  stake,
  minEarlyLeaderBid,
  minNewLeaderBid,
  maxNewLeaderBid,
  minFlipGap,
  maxEntryAsk,
  minSecondsToEnd,
  maxSecondsToEnd,
  takeProfitBid,
  stopBid,
  exitSecondsToEnd,
  assets,
  minAbsDistanceToBeatBps,
  maxAbsDistanceToBeatBps,
  minRecentVolatilityBps,
  maxRecentVolatilityBps,
  logFile
});

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Early Leader inversion paper");
  console.table([{
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    markets: report.markets,
    observations: report.observations,
    entries: report.entries,
    exits: report.exits,
    stake: report.stake.toFixed(2),
    pnl: report.pnl.toFixed(4),
    logFile: report.logFile
  }]);
}
