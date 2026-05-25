import { BinaryArbService } from "../services/binaryArbService.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const query = getArgValue(args, "--query", "bitcoin") ?? "bitcoin";
const limit = getNumberArg(args, "--limit", 100);
const maxPages = getNumberArg(args, "--max-pages", 3);
const seconds = getNumberArg(args, "--seconds", 120);
const pollSecs = getNumberArg(args, "--poll-secs", 1);
const threshold = getNumberArg(args, "--threshold", 1);
const logFile = getArgValue(args, "--log-file");
const json = hasFlag(args, "--json");

const report = await new BinaryArbService().runLiveArbMonitor({
  query,
  limit,
  maxPages,
  seconds,
  pollSecs,
  threshold,
  logFile
});

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Live binary-arb monitor");
  console.table([{
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    pollSecs: report.pollSecs,
    markets: report.markets,
    observations: report.observations,
    arbObservations: report.arbObservations,
    events: report.events.length,
    logFile: report.logFile ?? ""
  }]);

  console.log("Observed arb events");
  console.table(
    report.events.slice(0, 80).map((event) => ({
      title: event.title.slice(0, 55),
      firstSeen: event.firstSeen,
      durationMsLowerBound: event.durationMsLowerBound,
      observations: event.observations,
      maxEdgeTicks: event.maxEdgeTicks,
      maxPairedShares: event.maxPairedShares.toFixed(2),
      maxGrossProfit: event.maxEstimatedGrossProfit.toFixed(4)
    }))
  );
}
