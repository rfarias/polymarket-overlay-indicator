import { AgentService } from "../services/agentService.js";
import { appendScanLog, buildScanLogEntry } from "../services/scanLogger.js";
import { getArgValue, getNumberArg } from "../utils/args.js";

const args = process.argv.slice(2);
const intervalSeconds = getNumberArg(args, "--interval-secs", 300);
const runs = getNumberArg(args, "--runs", Number.POSITIVE_INFINITY);
const logFile = getArgValue(args, "--log", "logs/scans.jsonl")!;

const service = new AgentService();
let completed = 0;

while (completed < runs) {
  const startedAt = new Date().toISOString();
  const runId = `collect-${startedAt}`;

  try {
    const opportunities = await service.scan();
    const finishedAt = new Date().toISOString();
    const entry = buildScanLogEntry(runId, startedAt, finishedAt, opportunities);
    await appendScanLog(logFile, entry);

    console.log(
      [
        `[${finishedAt}]`,
        `run=${completed + 1}`,
        `scanned=${entry.scanned}`,
        `candidates=${entry.tradeCandidates}`,
        `alerts=${entry.alerts}`,
        `watch=${entry.watch}`,
        `avoid=${entry.avoid}`,
        `maxEdge=${entry.maxNetEdge?.toFixed(4) ?? "n/a"}`
      ].join(" ")
    );
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await appendScanLog(logFile, {
      runId,
      startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      scanned: 0,
      alerts: 0,
      tradeCandidates: 0,
      watch: 0,
      avoid: 0,
      avgConfidence: 0,
      avgRisk: 0,
      top: []
    });
    console.error(`[${finishedAt}] scan failed`, error);
  }

  completed += 1;
  if (completed >= runs) break;
  await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
}
