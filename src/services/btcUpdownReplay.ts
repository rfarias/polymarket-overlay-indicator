import { BinanceClient, SpotPoint } from "../adapters/binanceClient.js";
import { config } from "../config.js";
import { DataApiClient, UserActivity } from "../polymarket/dataApiClient.js";

export interface ReplayTrade {
  time: string;
  secondsFromStart: number;
  secondsToEnd: number;
  side?: string;
  outcome?: string;
  price: number;
  usdcSize: number;
  size: number;
  spotAtTrade?: number;
  spotMoveFromStartBps?: number;
  actionClass: "MOMENTUM" | "REVERSAL" | "HEDGE_OR_STRADDLE" | "UNCLEAR";
}

export interface ReplayWindow {
  slug: string;
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  startSpot?: number;
  endSpot?: number;
  result?: "Up" | "Down" | "Flat";
  tradeCount: number;
  buyUpUsdc: number;
  buyDownUsdc: number;
  sellUsdc: number;
  netUpShares: number;
  netDownShares: number;
  cost: number;
  estimatedPayout?: number;
  estimatedPnl?: number;
  estimatedRoi?: number;
  hedgeRatio: number;
  firstTradeSecondsFromStart?: number;
  lastTradeSecondsToEnd?: number;
  trades: ReplayTrade[];
  hypothesis: string[];
}

export interface ReplayReport {
  wallet: string;
  windows: number;
  resolvedWindows: number;
  estimatedPnl: number;
  estimatedCost: number;
  estimatedRoi: number;
  winRate: number;
  avgFirstTradeSecondsFromStart: number;
  avgLastTradeSecondsToEnd: number;
  momentumTrades: number;
  reversalTrades: number;
  hedgeTrades: number;
  windowsDetail: ReplayWindow[];
}

export interface SetupBucket {
  key: string;
  durationMinutes: number;
  actionClass: ReplayTrade["actionClass"];
  secondsToEndBucket: string;
  priceBucket: string;
  moveBucket: string;
  trades: number;
  stake: number;
  pnl: number;
  roi: number;
  winRate: number;
  avgPrice: number;
  avgAbsMoveBps: number;
  windows: number;
  examples: Array<{
    title: string;
    time: string;
    outcome?: string;
    result?: "Up" | "Down" | "Flat";
    price: number;
    secondsToEnd: number;
    moveBps?: number;
    pnl: number;
  }>;
}

export interface SetupMiningReport {
  wallet: string;
  sourceWindows: number;
  sourceTrades: number;
  eligibleTrades: number;
  skippedTrades: number;
  totalStake: number;
  totalPnl: number;
  totalRoi: number;
  bestSetups: SetupBucket[];
  worstSetups: SetupBucket[];
  byAction: SetupBucket[];
  byTime: SetupBucket[];
  byPrice: SetupBucket[];
  byMove: SetupBucket[];
}

export class BtcUpdownReplayService {
  private readonly data = new DataApiClient();
  private readonly binance = new BinanceClient();

  async replay(wallet: string, limit: number): Promise<ReplayReport> {
    const activity = await this.data.activity({ user: wallet, type: "TRADE", limit });
    const btcTrades = activity
      .filter((trade) => isBtcUpdownTrade(trade))
      .sort((a, b) => a.timestamp - b.timestamp);
    const grouped = groupByWindow(btcTrades);
    const windows: ReplayWindow[] = [];

    for (const [slug, trades] of grouped) {
      const windowInfo = inferWindow(trades[0]);
      if (!windowInfo) continue;
      windows.push(await this.replayWindow(slug, trades, windowInfo));
    }

    const resolved = windows.filter((window) => window.estimatedPnl !== undefined);
    const estimatedPnl = resolved.reduce((sum, window) => sum + (window.estimatedPnl ?? 0), 0);
    const estimatedCost = resolved.reduce((sum, window) => sum + window.cost, 0);
    const wins = resolved.filter((window) => (window.estimatedPnl ?? 0) > 0).length;
    const allTrades = windows.flatMap((window) => window.trades);

    return {
      wallet,
      windows: windows.length,
      resolvedWindows: resolved.length,
      estimatedPnl,
      estimatedCost,
      estimatedRoi: estimatedCost > 0 ? estimatedPnl / estimatedCost : 0,
      winRate: resolved.length ? wins / resolved.length : 0,
      avgFirstTradeSecondsFromStart: avg(windows.map((window) => window.firstTradeSecondsFromStart).filter(isNumber)),
      avgLastTradeSecondsToEnd: avg(windows.map((window) => window.lastTradeSecondsToEnd).filter(isNumber)),
      momentumTrades: allTrades.filter((trade) => trade.actionClass === "MOMENTUM").length,
      reversalTrades: allTrades.filter((trade) => trade.actionClass === "REVERSAL").length,
      hedgeTrades: allTrades.filter((trade) => trade.actionClass === "HEDGE_OR_STRADDLE").length,
      windowsDetail: windows.sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
    };
  }

  async mineSetups(wallet: string, limit: number, minTrades: number): Promise<SetupMiningReport> {
    const replay = await this.replay(wallet, limit);
    const rows: MiningRow[] = [];
    let sourceTrades = 0;
    let skippedTrades = 0;

    for (const window of replay.windowsDetail) {
      for (const trade of window.trades) {
        sourceTrades++;
        const row = tradeToMiningRow(window, trade);
        if (row) rows.push(row);
        else skippedTrades++;
      }
    }

    const totalStake = rows.reduce((sum, row) => sum + row.stake, 0);
    const totalPnl = rows.reduce((sum, row) => sum + row.pnl, 0);
    const buckets = bucketRows(rows, (row) =>
      [
        `${row.durationMinutes}m`,
        row.actionClass,
        `t:${row.secondsToEndBucket}`,
        `p:${row.priceBucket}`,
        `move:${row.moveBucket}`
      ].join(" | ")
    );
    const validBuckets = buckets.filter((bucket) => bucket.trades >= minTrades);

    return {
      wallet,
      sourceWindows: replay.windows,
      sourceTrades,
      eligibleTrades: rows.length,
      skippedTrades,
      totalStake,
      totalPnl,
      totalRoi: totalStake > 0 ? totalPnl / totalStake : 0,
      bestSetups: [...validBuckets].sort(sortBestBuckets).slice(0, 20),
      worstSetups: [...validBuckets].sort(sortWorstBuckets).slice(0, 20),
      byAction: bucketRows(rows, (row) => row.actionClass).sort(sortBestBuckets),
      byTime: bucketRows(rows, (row) => row.secondsToEndBucket).sort(sortBestBuckets),
      byPrice: bucketRows(rows, (row) => row.priceBucket).sort(sortBestBuckets),
      byMove: bucketRows(rows, (row) => row.moveBucket).sort(sortBestBuckets)
    };
  }

  private async replayWindow(
    slug: string,
    trades: UserActivity[],
    windowInfo: { startMs: number; endMs: number; durationMinutes: number }
  ): Promise<ReplayWindow> {
    const [startPoint, endPoint] = await Promise.all([
      this.binance.nearestPrice(config.binanceSymbol, windowInfo.startMs, 20_000).catch(() => undefined),
      this.binance.nearestPrice(config.binanceSymbol, windowInfo.endMs, 20_000).catch(() => undefined)
    ]);
    const tradePoints = new Map<number, SpotPoint | undefined>();
    for (const trade of trades) {
      tradePoints.set(
        trade.timestamp,
        await this.binance.nearestPrice(config.binanceSymbol, trade.timestamp * 1000, 15_000).catch(() => undefined)
      );
    }

    let netUpShares = 0;
    let netDownShares = 0;
    let cost = 0;
    let sellUsdc = 0;
    const replayTrades: ReplayTrade[] = trades.map((trade) => {
      const signedShares = trade.side === "SELL" ? -trade.size : trade.size;
      const signedCash = trade.side === "SELL" ? -trade.usdcSize : trade.usdcSize;
      if (trade.outcome === "Up") netUpShares += signedShares;
      if (trade.outcome === "Down") netDownShares += signedShares;
      if (trade.side === "SELL") sellUsdc += trade.usdcSize;
      cost += signedCash;
      const spotAtTrade = tradePoints.get(trade.timestamp)?.price;
      return {
        time: new Date(trade.timestamp * 1000).toISOString(),
        secondsFromStart: Math.round(trade.timestamp - windowInfo.startMs / 1000),
        secondsToEnd: Math.round(windowInfo.endMs / 1000 - trade.timestamp),
        side: trade.side,
        outcome: trade.outcome,
        price: trade.price,
        usdcSize: trade.usdcSize,
        size: trade.size,
        spotAtTrade,
        spotMoveFromStartBps: startPoint?.price && spotAtTrade
          ? ((spotAtTrade - startPoint.price) / startPoint.price) * 10_000
          : undefined,
        actionClass: classifyTrade(trade, startPoint?.price, spotAtTrade)
      };
    });

    const result = classifyResult(startPoint?.price, endPoint?.price);
    const estimatedPayout = result === "Up" ? Math.max(0, netUpShares) : result === "Down" ? Math.max(0, netDownShares) : undefined;
    const estimatedPnl = estimatedPayout === undefined ? undefined : estimatedPayout - cost;
    const buyUpUsdc = trades.filter((trade) => trade.side === "BUY" && trade.outcome === "Up").reduce((sum, trade) => sum + trade.usdcSize, 0);
    const buyDownUsdc = trades.filter((trade) => trade.side === "BUY" && trade.outcome === "Down").reduce((sum, trade) => sum + trade.usdcSize, 0);

    return {
      slug,
      title: trades[0].title ?? slug,
      startTime: new Date(windowInfo.startMs).toISOString(),
      endTime: new Date(windowInfo.endMs).toISOString(),
      durationMinutes: windowInfo.durationMinutes,
      startSpot: startPoint?.price,
      endSpot: endPoint?.price,
      result,
      tradeCount: trades.length,
      buyUpUsdc,
      buyDownUsdc,
      sellUsdc,
      netUpShares,
      netDownShares,
      cost,
      estimatedPayout,
      estimatedPnl,
      estimatedRoi: estimatedPnl !== undefined && cost > 0 ? estimatedPnl / cost : undefined,
      hedgeRatio: Math.min(buyUpUsdc, buyDownUsdc) / Math.max(0.0001, Math.max(buyUpUsdc, buyDownUsdc)),
      firstTradeSecondsFromStart: replayTrades[0]?.secondsFromStart,
      lastTradeSecondsToEnd: replayTrades.at(-1)?.secondsToEnd,
      trades: replayTrades,
      hypothesis: inferWindowHypothesis(replayTrades, buyUpUsdc, buyDownUsdc)
    };
  }
}

interface MiningRow {
  windowSlug: string;
  title: string;
  durationMinutes: number;
  result: "Up" | "Down";
  actionClass: ReplayTrade["actionClass"];
  secondsToEndBucket: string;
  priceBucket: string;
  moveBucket: string;
  stake: number;
  pnl: number;
  win: boolean;
  price: number;
  absMoveBps: number;
  time: string;
  outcome?: string;
  secondsToEnd: number;
  moveBps?: number;
}

function tradeToMiningRow(window: ReplayWindow, trade: ReplayTrade): MiningRow | undefined {
  if (trade.side !== "BUY") return undefined;
  if (window.result !== "Up" && window.result !== "Down") return undefined;
  if (trade.outcome !== "Up" && trade.outcome !== "Down") return undefined;
  if (!Number.isFinite(trade.secondsToEnd) || trade.secondsToEnd < 0) return undefined;
  if (trade.secondsFromStart < 0 || trade.secondsFromStart > window.durationMinutes * 60) return undefined;

  const win = trade.outcome === window.result;
  const pnl = win ? trade.size - trade.usdcSize : -trade.usdcSize;
  const absMoveBps = Math.abs(trade.spotMoveFromStartBps ?? 0);
  return {
    windowSlug: window.slug,
    title: window.title,
    durationMinutes: window.durationMinutes,
    result: window.result,
    actionClass: trade.actionClass,
    secondsToEndBucket: bucketSecondsToEnd(trade.secondsToEnd),
    priceBucket: bucketPrice(trade.price),
    moveBucket: bucketAbsMoveBps(absMoveBps),
    stake: trade.usdcSize,
    pnl,
    win,
    price: trade.price,
    absMoveBps,
    time: trade.time,
    outcome: trade.outcome,
    secondsToEnd: trade.secondsToEnd,
    moveBps: trade.spotMoveFromStartBps
  };
}

function bucketRows(rows: MiningRow[], keyFn: (row: MiningRow) => string): SetupBucket[] {
  const grouped = new Map<string, MiningRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return [...grouped.entries()].map(([key, bucketRows]) => {
    const stake = bucketRows.reduce((sum, row) => sum + row.stake, 0);
    const pnl = bucketRows.reduce((sum, row) => sum + row.pnl, 0);
    const representative = bucketRows[0];
    return {
      key,
      durationMinutes: representative.durationMinutes,
      actionClass: representative.actionClass,
      secondsToEndBucket: representative.secondsToEndBucket,
      priceBucket: representative.priceBucket,
      moveBucket: representative.moveBucket,
      trades: bucketRows.length,
      stake,
      pnl,
      roi: stake > 0 ? pnl / stake : 0,
      winRate: bucketRows.filter((row) => row.win).length / bucketRows.length,
      avgPrice: avg(bucketRows.map((row) => row.price)),
      avgAbsMoveBps: avg(bucketRows.map((row) => row.absMoveBps)),
      windows: new Set(bucketRows.map((row) => row.windowSlug)).size,
      examples: bucketRows
        .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
        .slice(0, 5)
        .map((row) => ({
          title: row.title,
          time: row.time,
          outcome: row.outcome,
          result: row.result,
          price: row.price,
          secondsToEnd: row.secondsToEnd,
          moveBps: row.moveBps,
          pnl: row.pnl
        }))
    };
  });
}

function sortBestBuckets(a: SetupBucket, b: SetupBucket): number {
  return b.roi - a.roi || b.pnl - a.pnl || b.trades - a.trades;
}

function sortWorstBuckets(a: SetupBucket, b: SetupBucket): number {
  return a.roi - b.roi || a.pnl - b.pnl || b.trades - a.trades;
}

function bucketSecondsToEnd(seconds: number): string {
  if (seconds <= 30) return "000-030s";
  if (seconds <= 60) return "031-060s";
  if (seconds <= 120) return "061-120s";
  if (seconds <= 180) return "121-180s";
  return "181s+";
}

function bucketPrice(price: number): string {
  if (price <= 0.1) return "0.00-0.10";
  if (price <= 0.2) return "0.10-0.20";
  if (price <= 0.35) return "0.20-0.35";
  if (price <= 0.5) return "0.35-0.50";
  if (price <= 0.65) return "0.50-0.65";
  return "0.65-1.00";
}

function bucketAbsMoveBps(absMoveBps: number): string {
  if (absMoveBps < 5) return "00-05bps";
  if (absMoveBps < 10) return "05-10bps";
  if (absMoveBps < 20) return "10-20bps";
  if (absMoveBps < 40) return "20-40bps";
  return "40bps+";
}

function isBtcUpdownTrade(trade: UserActivity): boolean {
  const text = `${trade.title ?? ""} ${trade.slug ?? ""}`.toLowerCase();
  return text.includes("bitcoin up or down") || text.includes("btc-updown");
}

function groupByWindow(trades: UserActivity[]): Map<string, UserActivity[]> {
  const grouped = new Map<string, UserActivity[]>();
  for (const trade of trades) {
    const key = trade.slug ?? trade.eventSlug ?? trade.conditionId ?? "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), trade]);
  }
  return grouped;
}

function inferWindow(trade: UserActivity): { startMs: number; endMs: number; durationMinutes: number } | undefined {
  const slug = trade.slug ?? trade.eventSlug ?? "";
  const match = slug.match(/(?:btc|bitcoin)-updown-(\d+)m-(\d{10})/i);
  if (match) {
    const durationMinutes = Number(match[1]);
    const startMs = Number(match[2]) * 1000;
    return { startMs, endMs: startMs + durationMinutes * 60_000, durationMinutes };
  }

  const title = trade.title ?? "";
  const durationMinutes = /15m|15:00|15PM|15AM/i.test(slug) ? 15 : 5;
  const fallbackStartMs = Math.floor(trade.timestamp / (durationMinutes * 60)) * durationMinutes * 60_000;
  if (/Bitcoin Up or Down/i.test(title)) {
    return { startMs: fallbackStartMs, endMs: fallbackStartMs + durationMinutes * 60_000, durationMinutes };
  }

  return undefined;
}

function classifyResult(start?: number, end?: number): "Up" | "Down" | "Flat" | undefined {
  if (!start || !end) return undefined;
  if (end > start) return "Up";
  if (end < start) return "Down";
  return "Flat";
}

function classifyTrade(trade: UserActivity, start?: number, spot?: number): ReplayTrade["actionClass"] {
  if (!start || !spot || !trade.outcome) return "UNCLEAR";
  const movedUp = spot > start;
  if ((trade.outcome === "Up" && movedUp) || (trade.outcome === "Down" && !movedUp)) return "MOMENTUM";
  return "REVERSAL";
}

function inferWindowHypothesis(trades: ReplayTrade[], buyUpUsdc: number, buyDownUsdc: number): string[] {
  const hypotheses: string[] = [];
  const hedgeRatio = Math.min(buyUpUsdc, buyDownUsdc) / Math.max(0.0001, Math.max(buyUpUsdc, buyDownUsdc));
  const lateTrades = trades.filter((trade) => trade.secondsToEnd <= 60).length;
  const momentum = trades.filter((trade) => trade.actionClass === "MOMENTUM").length;
  const reversal = trades.filter((trade) => trade.actionClass === "REVERSAL").length;

  if (hedgeRatio > 0.25) hypotheses.push("Buys both sides materially; likely dynamic hedge/straddle management.");
  if (lateTrades / Math.max(1, trades.length) > 0.5) hypotheses.push("Most activity is in final minute; timing/execution edge is likely important.");
  if (momentum > reversal * 1.5) hypotheses.push("Trade direction tends to follow BTC move from window start: momentum bias.");
  if (reversal > momentum * 1.5) hypotheses.push("Trade direction tends to fade BTC move from window start: reversal/mean-reversion bias.");
  if (hypotheses.length === 0) hypotheses.push("Mixed pattern; needs more windows or order-book context.");
  return hypotheses;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function isNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}
