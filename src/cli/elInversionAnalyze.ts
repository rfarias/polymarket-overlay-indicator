import fs from "node:fs";
import path from "node:path";
import { getArgValue, hasFlag } from "../utils/args.js";

interface ExitRow {
  type?: string;
  observedAt?: string;
  slug?: string;
  asset?: string;
  outcome?: string;
  entryAsk?: number;
  exitBid?: number;
  stake?: number;
  requestedStake?: number;
  shares?: number;
  pnl?: number;
  secondsToEnd?: number;
  entrySecondsToEnd?: number;
  reason?: string;
  entryBestAskSize?: number;
  entrySpread?: number;
  fillRatio?: number;
  entryDistanceToBeatBps?: number;
  distanceToBeatBps?: number;
  entryRecentVolatilityBps?: number;
  recentVolatilityBps?: number;
}

interface SignalRow extends ExitRow {
  observedAt?: string;
}

interface LogStats {
  file: string;
  totalRows: number;
  exits: number;
  entries: number;
  signals: number;
  skips: number;
  skipReasons: Array<{ reason: string; count: number }>;
  signalGroups: SignalSummary[];
}

interface SimTrade {
  stakeLevel: number;
  file: string;
  asset: string;
  slug?: string;
  observedAt?: string;
  reason: string;
  entryAsk: number;
  exitBid: number;
  fillStake: number;
  requestedStake: number;
  fillRatio: number;
  pnl: number;
  roi: number;
  liquidityKnown: boolean;
  legacyLiquidityFallback: boolean;
  secondsToEnd?: number;
  entrySecondsToEnd?: number;
  distanceBps?: number;
  volatilityBps?: number;
}

interface Summary {
  name: string;
  stakeLevel: number;
  trades: number;
  wins: number;
  losses: number;
  volume: number;
  pnl: number;
  roi: number;
  avgFillRatio: number;
  liquidityKnown: number;
}

interface SignalSummary {
  name: string;
  signals: number;
  avgEntryAsk: number;
  avgSecondsToEnd: number;
  avgAbsDistanceBps: number;
  avgVolatilityBps: number;
}

const args = process.argv.slice(2);
const logArg = getArgValue(args, "--logs", "");
const stakes = parseCsvNumbers(getArgValue(args, "--stakes", "1,5,10"));
const json = hasFlag(args, "--json");
const files = logArg
  ? logArg.split(",").map((file) => file.trim()).filter(Boolean)
  : defaultLogFiles();

const parsedLogs = files.map((file) => ({ file, rows: readRows(file) }));
const rows = parsedLogs.flatMap(({ file, rows }) => rows
  .filter((row): row is ExitRow => row.type === "EXIT" && isFiniteNumber(row.entryAsk) && isFiniteNumber(row.exitBid))
  .map((row) => ({ ...row, sourceFile: file } as ExitRow & { sourceFile: string })));
const signals = parsedLogs.flatMap(({ file, rows }) => rows
  .filter((row): row is SignalRow => row.type === "SIGNAL" && isFiniteNumber(row.entryAsk))
  .map((row) => ({ ...row, sourceFile: file } as SignalRow & { sourceFile: string })));
const logStats = parsedLogs.map(({ file, rows }) => summarizeLog(file, rows));
const trades = stakes.flatMap((stakeLevel) => rows.map((row) => simulate(row, stakeLevel, row.sourceFile)).filter((row): row is SimTrade => row !== undefined));
const summaries = stakes.flatMap((stakeLevel) => summarizeStake(trades.filter((trade) => trade.stakeLevel === stakeLevel)));
const lossPatterns = stakes.map((stakeLevel) => ({
  stakeLevel,
  groups: summarizeLossPatterns(trades.filter((trade) => trade.stakeLevel === stakeLevel && trade.pnl < 0))
}));
const signalSummary = summarizeSignals(signals);

const result = {
  generatedAt: new Date().toISOString(),
  files,
  logStats,
  exitRows: rows.length,
  signalRows: signals.length,
  note: "Logs without entryBestAskSize use the executed paper stake as a conservative legacy liquidity fallback.",
  summaries,
  signalSummary,
  lossPatterns
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`EL inversion analysis (${rows.length} exits, ${signals.length} signals)`);
  console.log(result.note);
  console.log("\nLog stats");
  printLogStats(logStats);
  if (signalSummary.length) {
    console.log("\nSignals");
    printSignalTable(signalSummary);
  }
  for (const stakeLevel of stakes) {
    console.log(`\nStake ${money(stakeLevel)} requested`);
    printTable(summaries.filter((row) => row.stakeLevel === stakeLevel));
  }
}

function readRows(file: string): ExitRow[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => safeJson(line))
    .filter((row): row is ExitRow => row !== undefined);
}

function simulate(row: ExitRow, stakeLevel: number, file: string): SimTrade | undefined {
  if (!isFiniteNumber(row.entryAsk) || !isFiniteNumber(row.exitBid) || row.entryAsk <= 0) return undefined;
  const liquidityKnown = isFiniteNumber(row.entryBestAskSize);
  const maxStake = liquidityKnown ? row.entryAsk * Number(row.entryBestAskSize) : Number(row.stake ?? stakeLevel);
  const fillStake = Math.max(0, Math.min(stakeLevel, maxStake));
  if (fillStake <= 0) return undefined;
  const shares = fillStake / row.entryAsk;
  const pnl = shares * row.exitBid - fillStake;
  const asset = (row.asset ?? row.slug?.match(/^(btc|eth|sol|xrp|doge|bnb)-/i)?.[1] ?? "UNKNOWN").toUpperCase();
  return {
    stakeLevel,
    file,
    asset,
    slug: row.slug,
    observedAt: row.observedAt,
    reason: row.reason ?? "unknown",
    entryAsk: row.entryAsk,
    exitBid: row.exitBid,
    fillStake,
    requestedStake: stakeLevel,
    fillRatio: stakeLevel > 0 ? fillStake / stakeLevel : 0,
    pnl,
    roi: fillStake > 0 ? pnl / fillStake : 0,
    liquidityKnown,
    legacyLiquidityFallback: !liquidityKnown,
    secondsToEnd: row.secondsToEnd,
    entrySecondsToEnd: row.entrySecondsToEnd ?? row.secondsToEnd,
    distanceBps: row.entryDistanceToBeatBps ?? row.distanceToBeatBps,
    volatilityBps: row.entryRecentVolatilityBps ?? row.recentVolatilityBps
  };
}

function summarizeLog(file: string, rows: ExitRow[]): LogStats {
  const skipRows = rows.filter((row) => row.type === "SKIP");
  return {
    file,
    totalRows: rows.length,
    exits: rows.filter((row) => row.type === "EXIT").length,
    entries: rows.filter((row) => row.type === "ENTRY").length,
    signals: rows.filter((row) => row.type === "SIGNAL").length,
    skips: skipRows.length,
    skipReasons: topSkipReasons(skipRows),
    signalGroups: summarizeSignals(rows.filter((row): row is SignalRow => row.type === "SIGNAL" && isFiniteNumber(row.entryAsk)))
  };
}

function topSkipReasons(rows: ExitRow[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const reason = String(row.reason ?? "unknown").split(" ")[0] ?? "unknown";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function summarizeSignals(rows: SignalRow[]): SignalSummary[] {
  const groups: Array<[string, (row: SignalRow) => boolean]> = [
    ["all", () => true],
    ["SOL", (row) => assetOf(row) === "SOL"],
    ["XRP", (row) => assetOf(row) === "XRP"],
    ["BTC", (row) => assetOf(row) === "BTC"],
    ["ETH", (row) => assetOf(row) === "ETH"],
    ["entry ask <=0.65", (row) => Number(row.entryAsk) <= 0.65],
    ["entry time <=60s", (row) => Number(row.entrySecondsToEnd ?? row.secondsToEnd) <= 60]
  ];
  return groups.map(([name, predicate]) => aggregateSignals(name, rows.filter(predicate))).filter((row) => row.signals > 0);
}

function aggregateSignals(name: string, rows: SignalRow[]): SignalSummary {
  return {
    name,
    signals: rows.length,
    avgEntryAsk: avg(rows.map((row) => row.entryAsk).filter(isFiniteNumber)),
    avgSecondsToEnd: avg(rows.map((row) => row.entrySecondsToEnd ?? row.secondsToEnd).filter(isFiniteNumber)),
    avgAbsDistanceBps: avg(rows.map((row) => Math.abs(Number(row.entryDistanceToBeatBps ?? row.distanceToBeatBps))).filter(Number.isFinite)),
    avgVolatilityBps: avg(rows.map((row) => row.entryRecentVolatilityBps ?? row.recentVolatilityBps).filter(isFiniteNumber))
  };
}

function summarizeStake(trades: SimTrade[]): Summary[] {
  const groups: Array<[string, (trade: SimTrade) => boolean]> = [
    ["all", () => true],
    ["SOL+XRP all", (trade) => trade.asset === "SOL" || trade.asset === "XRP"],
    ["SOL", (trade) => trade.asset === "SOL"],
    ["XRP", (trade) => trade.asset === "XRP"],
    ["BTC", (trade) => trade.asset === "BTC"],
    ["ETH", (trade) => trade.asset === "ETH"],
    ["exit take_profit", (trade) => trade.reason === "take_profit"],
    ["exit stop", (trade) => trade.reason === "stop"],
    ["exit near_end", (trade) => trade.reason === "near_end"],
    ["entry ask <=0.15", (trade) => trade.entryAsk <= 0.15],
    ["entry ask 0.15-0.30", (trade) => trade.entryAsk > 0.15 && trade.entryAsk <= 0.30],
    ["entry ask 0.30-0.50", (trade) => trade.entryAsk > 0.30 && trade.entryAsk <= 0.50],
    ["entry ask 0.50-0.65", (trade) => trade.entryAsk > 0.50 && trade.entryAsk <= 0.65],
    ["entry ask >0.65", (trade) => trade.entryAsk > 0.65],
    ["entry time <=30s", (trade) => Number(trade.entrySecondsToEnd) <= 30],
    ["entry time 30-60s", (trade) => Number(trade.entrySecondsToEnd) > 30 && Number(trade.entrySecondsToEnd) <= 60],
    ["entry time 60-120s", (trade) => Number(trade.entrySecondsToEnd) > 60 && Number(trade.entrySecondsToEnd) <= 120],
    ["entry time >120s", (trade) => Number(trade.entrySecondsToEnd) > 120],
    ["exit time<=60s", (trade) => Number(trade.secondsToEnd) <= 60],
    ["distance 2-5bps", (trade) => {
      const distance = Math.abs(Number(trade.distanceBps));
      return distance >= 2 && distance <= 5;
    }],
    ["vol 0.5-1.5bps", (trade) => {
      const volatility = Number(trade.volatilityBps);
      return volatility >= 0.5 && volatility <= 1.5;
    }],
    ["SOL+XRP time+distance", (trade) => {
      const distance = Math.abs(Number(trade.distanceBps));
      return (trade.asset === "SOL" || trade.asset === "XRP") && Number(trade.secondsToEnd) <= 60 && distance >= 2 && distance <= 5;
    }],
    ["SOL+XRP ask<=0.65", (trade) => {
      return (trade.asset === "SOL" || trade.asset === "XRP") && trade.entryAsk <= 0.65;
    }]
  ];
  return groups.map(([name, predicate]) => aggregate(name, trades.filter(predicate))).filter((row) => row.trades > 0);
}

function summarizeLossPatterns(losses: SimTrade[]): Summary[] {
  const groups: Array<[string, (trade: SimTrade) => boolean]> = [
    ["losses all", () => true],
    ["losses SOL", (trade) => trade.asset === "SOL"],
    ["losses XRP", (trade) => trade.asset === "XRP"],
    ["early stops >90s", (trade) => trade.reason === "stop" && Number(trade.secondsToEnd) > 90],
    ["late stops <=60s", (trade) => trade.reason === "stop" && Number(trade.secondsToEnd) <= 60],
    ["distance <2bps", (trade) => Math.abs(Number(trade.distanceBps)) < 2],
    ["distance 2-5bps", (trade) => {
      const distance = Math.abs(Number(trade.distanceBps));
      return distance >= 2 && distance <= 5;
    }],
    ["vol >1.5bps", (trade) => Number(trade.volatilityBps) > 1.5]
  ];
  return groups.map(([name, predicate]) => aggregate(name, losses.filter(predicate))).filter((row) => row.trades > 0);
}

function printLogStats(rows: LogStats[]): void {
  const header = "file                                           rows exits entries signals skips top skips";
  console.log(header);
  for (const row of rows) {
    const file = path.basename(row.file);
    const reasons = row.skipReasons.map((reason) => `${reason.reason}:${reason.count}`).join(", ");
    console.log(
      `${file.padEnd(46)} ${String(row.totalRows).padStart(4)} ${String(row.exits).padStart(5)} ${String(row.entries).padStart(7)} ${String(row.signals).padStart(7)} ${String(row.skips).padStart(5)} ${reasons}`
    );
  }
}

function printSignalTable(rows: SignalSummary[]): void {
  const header = "group                         signals  avg ask  avg sec  avg |dist|  avg vol";
  console.log(header);
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(29)} ${String(row.signals).padStart(7)} ${row.avgEntryAsk.toFixed(3).padStart(8)} ${row.avgSecondsToEnd.toFixed(1).padStart(8)} ${row.avgAbsDistanceBps.toFixed(2).padStart(11)} ${row.avgVolatilityBps.toFixed(2).padStart(8)}`
    );
  }
}

function aggregate(name: string, trades: SimTrade[]): Summary {
  const volume = sum(trades.map((trade) => trade.fillStake));
  const pnl = sum(trades.map((trade) => trade.pnl));
  return {
    name,
    stakeLevel: trades[0]?.stakeLevel ?? 0,
    trades: trades.length,
    wins: trades.filter((trade) => trade.pnl > 0).length,
    losses: trades.filter((trade) => trade.pnl < 0).length,
    volume,
    pnl,
    roi: volume > 0 ? pnl / volume : 0,
    avgFillRatio: trades.length ? sum(trades.map((trade) => trade.fillRatio)) / trades.length : 0,
    liquidityKnown: trades.filter((trade) => trade.liquidityKnown).length
  };
}

function printTable(rows: Summary[]): void {
  const header = "group                         trades   W/L       volume      pnl       roi    fill";
  console.log(header);
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(29)} ${String(row.trades).padStart(6)}   ${`${row.wins}/${row.losses}`.padEnd(7)} ${money(row.volume).padStart(9)} ${signed(row.pnl).padStart(9)} ${pct(row.roi).padStart(8)} ${pct(row.avgFillRatio).padStart(7)}`
    );
  }
}

function defaultLogFiles(): string[] {
  if (!fs.existsSync("logs")) return [];
  return fs
    .readdirSync("logs")
    .filter((file) => /^el_inversion.*\.jsonl$/i.test(file))
    .map((file) => path.join("logs", file));
}

function parseCsvNumbers(value: string | undefined): number[] {
  return (value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function safeJson(line: string): ExitRow | undefined {
  try {
    return JSON.parse(line) as ExitRow;
  } catch {
    return undefined;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assetOf(row: ExitRow): string {
  return (row.asset ?? row.slug?.match(/^(btc|eth|sol|xrp|doge|bnb)-/i)?.[1] ?? "UNKNOWN").toUpperCase();
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function avg(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
