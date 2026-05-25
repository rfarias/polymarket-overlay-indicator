import { AgentService } from "../services/agentService.js";
import { appendScanLog, buildScanLogEntry } from "../services/scanLogger.js";
import { getArgValue } from "../utils/args.js";

const service = new AgentService();
const startedAt = new Date().toISOString();
const opportunities = await service.scan();
const finishedAt = new Date().toISOString();
const runId = getArgValue(process.argv.slice(2), "--run-id", `scan-${startedAt}`)!;
const logFile = getArgValue(process.argv.slice(2), "--log", "logs/scans.jsonl")!;
const alerts = opportunities.filter((item) => item.suggestion === "ALERT" || item.suggestion === "TRADE_CANDIDATE");
const entry = buildScanLogEntry(runId, startedAt, finishedAt, opportunities);
await appendScanLog(logFile, entry);

console.log(`Scanned ${opportunities.length} markets.`);
console.log(`Saved SQLite snapshots and appended run log to ${logFile}.`);
console.log(
  `Signals: ${entry.tradeCandidates} trade candidates, ${entry.alerts} alerts, ${entry.watch} watch, ${entry.avoid} avoid.`
);
console.table(
  alerts.slice(0, 20).map((item) => ({
    suggestion: item.suggestion,
    netEdge: item.netEdge?.toFixed(4),
    confidence: item.confidence.toFixed(2),
    risk: item.risk.toFixed(2),
    source: item.classification.type,
    market: item.market.title.slice(0, 80)
  }))
);
