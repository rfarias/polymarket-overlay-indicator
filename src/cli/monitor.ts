import { AgentService } from "../services/agentService.js";
import { appendScanLog, buildScanLogEntry } from "../services/scanLogger.js";
import { getArgValue, getNumberArg } from "../utils/args.js";

const args = process.argv.slice(2);
const intervalSeconds = getNumberArg(args, "--interval-secs", 30);
const runs = getNumberArg(args, "--runs", Number.POSITIVE_INFINITY);
const limit = getNumberArg(args, "--limit", 80);
const maxPages = getNumberArg(args, "--max-pages", 1);
const logFile = getArgValue(args, "--log", "logs/latency-monitor.jsonl")!;

const service = new AgentService();
let completed = 0;

while (completed < runs) {
  const startedAt = new Date().toISOString();
  const runId = `latency-monitor-${startedAt}`;

  try {
    const opportunities = await service.scan({ universe: "latency", limit, maxPages });
    const finishedAt = new Date().toISOString();
    const entry = buildScanLogEntry(runId, startedAt, finishedAt, opportunities);
    await appendScanLog(logFile, entry);

    console.log(
      [
        `[${finishedAt}]`,
        `run=${completed + 1}`,
        `latencyMarkets=${entry.scanned}`,
        `candidates=${entry.tradeCandidates}`,
        `alerts=${entry.alerts}`,
        `watch=${entry.watch}`,
        `avoid=${entry.avoid}`,
        `maxEdge=${entry.maxNetEdge?.toFixed(4) ?? "n/a"}`
      ].join(" ")
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] latency monitor failed`, error);
  }

  completed += 1;
  if (completed >= runs) break;
  await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
}
