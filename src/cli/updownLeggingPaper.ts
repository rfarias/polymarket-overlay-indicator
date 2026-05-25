import { UpdownLeggingPaperService } from "../services/updownLeggingPaperService.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const seconds = getNumberArg(args, "--seconds", 300);
const pollSecs = getNumberArg(args, "--poll-secs", 1);
const limit = getNumberArg(args, "--limit", 100);
const maxPages = getNumberArg(args, "--max-pages", 5);
const stake = getNumberArg(args, "--stake", 10);
const cheapMax = getNumberArg(args, "--cheap-max", 0.1);
const maxSum = getNumberArg(args, "--max-sum", 0.99);
const hedgeWindowSecs = getNumberArg(args, "--hedge-window-secs", 20);
const minAskSize = getNumberArg(args, "--min-ask-size", 1);
const durationMinutes = getNumberArg(args, "--duration-minutes", 0) || undefined;
const minSecondsToEnd = getNumberArg(args, "--min-seconds-to-end", 0);
const maxSecondsToEnd = getNumberArg(args, "--max-seconds-to-end", 999999);
const minSumBids = getNumberArg(args, "--min-sum-bids", 0);
const maxExitGapTotal = getNumberArg(args, "--max-exit-gap-total", 999);
const maxOppositeAskAtFirst = getNumberArg(args, "--max-opposite-ask-at-first", 1);
const earlyLeaderFilter = hasFlag(args, "--early-leader-filter");
const elDetectMinBid = getNumberArg(args, "--el-detect-min-bid", 0.55);
const elContinuationMinBid = getNumberArg(args, "--el-continuation-min-bid", 0.70);
const elVelocityMin = getNumberArg(args, "--el-velocity-min", 0.08);
const elBlockLeaderBidMin = getNumberArg(args, "--el-block-leader-bid-min", 0.70);
const logFile = getArgValue(args, "--log-file", `logs/updown_legging_paper_${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`)!;
const json = hasFlag(args, "--json");

const report = await new UpdownLeggingPaperService().run({
  seconds,
  pollSecs,
  limit,
  maxPages,
  stake,
  cheapMax,
  maxSum,
  hedgeWindowSecs,
  minAskSize,
  durationMinutes,
  minSecondsToEnd,
  maxSecondsToEnd,
  minSumBids,
  maxExitGapTotal,
  maxOppositeAskAtFirst,
  earlyLeaderFilter,
  elDetectMinBid,
  elContinuationMinBid,
  elVelocityMin,
  elBlockLeaderBidMin,
  logFile
});

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Crypto Up/Down legging paper");
  console.table([{
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    markets: report.markets,
    observations: report.observations,
    firstLegs: report.firstLegs,
    hedged: report.hedged,
    expired: report.expired,
    stakeCommitted: report.stakeCommitted.toFixed(2),
    lockedProfit: report.lockedProfit.toFixed(4),
    avgSecondsToHedge: report.avgSecondsToHedge.toFixed(2),
    logFile: report.logFile
  }]);
}
