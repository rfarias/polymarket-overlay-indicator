import { LagContinuationPaperService } from "../services/lagContinuationPaperService.js";
import { getArgValue, getNumberArg } from "../utils/args.js";

const args = process.argv.slice(2);
const seconds = getNumberArg(args, "--seconds", 3600);
const pollSecs = getNumberArg(args, "--poll-secs", 1);
const stake = getNumberArg(args, "--stake", 5);
// lag_continuation_30s_dom_cheap canonical parameters
const minSecondsToEnd = getNumberArg(args, "--min-seconds-to-end", 30);
const maxSecondsToEnd = getNumberArg(args, "--max-seconds-to-end", 120);
const minSignedDistanceBps = getNumberArg(args, "--min-signed-distance-bps", -30);
const maxSignedDistanceBps = getNumberArg(args, "--max-signed-distance-bps", 30);
const momentumWindowSec = getNumberArg(args, "--momentum-window-sec", 30);
const minMomentumBps = getNumberArg(args, "--min-momentum-bps", 4);
const maxEntryAsk = getNumberArg(args, "--max-entry-ask", 0.70);
const exitSecondsToEnd = getNumberArg(args, "--exit-seconds-to-end", 5);
// gate adicionado em 2026-07-06: zona secs[75,90) e a unica faixa com PnL negativo
const excludeSecondsToEndMin = getNumberArg(args, "--exclude-seconds-to-end-min", 75);
const excludeSecondsToEndMax = getNumberArg(args, "--exclude-seconds-to-end-max", 90);
const logFile = getArgValue(
  args,
  "--log-file",
  `logs/lag_continuation_paper_${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`
)!;

const report = await new LagContinuationPaperService().run({
  seconds,
  pollSecs,
  stake,
  minSecondsToEnd,
  maxSecondsToEnd,
  minSignedDistanceBps,
  maxSignedDistanceBps,
  momentumWindowSec,
  minMomentumBps,
  maxEntryAsk,
  exitSecondsToEnd,
  excludeSecondsToEndMin,
  excludeSecondsToEndMax,
  logFile
});

console.log("Lag Continuation 30s paper");
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
