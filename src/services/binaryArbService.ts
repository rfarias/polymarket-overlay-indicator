import fs from "node:fs";
import path from "node:path";
import { ClobClient } from "../polymarket/clobClient.js";
import { DataApiClient, UserActivity } from "../polymarket/dataApiClient.js";
import { GammaClient } from "../polymarket/gammaClient.js";
import { MarketSummary } from "../types.js";

export interface WalletArbPair {
  slug: string;
  title: string;
  firstTime: string;
  secondTime: string;
  secondsBetween: number;
  upPrice: number;
  downPrice: number;
  sumPrice: number;
  edgeTicks: number;
  pairedShares: number;
  estimatedLockedProfit: number;
  upUsdc: number;
  downUsdc: number;
  upTx?: string;
  downTx?: string;
}

export interface WalletArbAudit {
  wallet: string;
  sourceTrades: number;
  buyTrades: number;
  candidatePairs: number;
  profitablePairs: number;
  totalPairedShares: number;
  estimatedLockedProfit: number;
  avgSecondsBetween: number;
  avgEdgeTicks: number;
  pairs: WalletArbPair[];
}

export interface LiveArbObservation {
  marketId: string;
  slug: string;
  title: string;
  observedAt: string;
  upAsk?: number;
  downAsk?: number;
  sumAsk?: number;
  edgeTicks?: number;
  upAskSize?: number;
  downAskSize?: number;
  pairedShares?: number;
  estimatedGrossProfit?: number;
  status: "ARB" | "NO_ARB" | "INCOMPLETE_BOOK" | "ERROR";
  error?: string;
}

export interface LiveArbEvent {
  key: string;
  marketId: string;
  slug: string;
  title: string;
  firstSeen: string;
  lastSeen: string;
  observations: number;
  durationMsLowerBound: number;
  maxEdgeTicks: number;
  maxPairedShares: number;
  maxEstimatedGrossProfit: number;
}

export interface LiveArbRunReport {
  startedAt: string;
  endedAt: string;
  pollSecs: number;
  markets: number;
  observations: number;
  arbObservations: number;
  events: LiveArbEvent[];
  logFile?: string;
}

export class BinaryArbService {
  private readonly data = new DataApiClient();
  private readonly gamma = new GammaClient();
  private readonly clob = new ClobClient();

  async auditWallet(wallet: string, limit: number, maxPairSeconds: number): Promise<WalletArbAudit> {
    const activity = await this.data.activity({ user: wallet, type: "TRADE", limit });
    const buyTrades = activity
      .filter((trade) => trade.side === "BUY" && isUpDownOutcome(trade.outcome))
      .sort((a, b) => a.timestamp - b.timestamp);
    const grouped = groupTrades(buyTrades);
    const pairs: WalletArbPair[] = [];

    for (const trades of grouped.values()) {
      const ups = trades.filter((trade) => trade.outcome === "Up").map(toPairFill);
      const downs = trades.filter((trade) => trade.outcome === "Down").map(toPairFill);
      for (const up of ups) {
        while (up.remainingShares > 0) {
          const match = downs
            .filter((down) => down.remainingShares > 0)
            .map((down) => ({ down, seconds: Math.abs(down.trade.timestamp - up.trade.timestamp) }))
            .filter((item) => item.seconds <= maxPairSeconds)
            .sort((a, b) => priceSum(up.trade, a.down.trade) - priceSum(up.trade, b.down.trade) || a.seconds - b.seconds)[0];
          if (!match) break;

          const sumPrice = priceSum(up.trade, match.down.trade);
          const pairedShares = Math.min(up.remainingShares, match.down.remainingShares);
          up.remainingShares -= pairedShares;
          match.down.remainingShares -= pairedShares;
          if (sumPrice >= 1) continue;

          const estimatedLockedProfit = (1 - sumPrice) * pairedShares;
          pairs.push({
            slug: up.trade.slug ?? up.trade.eventSlug ?? up.trade.conditionId ?? "unknown",
            title: up.trade.title ?? match.down.trade.title ?? "unknown",
            firstTime: new Date(Math.min(up.trade.timestamp, match.down.trade.timestamp) * 1000).toISOString(),
            secondTime: new Date(Math.max(up.trade.timestamp, match.down.trade.timestamp) * 1000).toISOString(),
            secondsBetween: match.seconds,
            upPrice: up.trade.price,
            downPrice: match.down.trade.price,
            sumPrice,
            edgeTicks: Math.round((1 - sumPrice) * 100),
            pairedShares,
            estimatedLockedProfit,
            upUsdc: up.trade.usdcSize,
            downUsdc: match.down.trade.usdcSize,
            upTx: up.trade.transactionHash,
            downTx: match.down.trade.transactionHash
          });
        }
      }
    }

    const profitablePairs = pairs;
    return {
      wallet,
      sourceTrades: activity.length,
      buyTrades: buyTrades.length,
      candidatePairs: pairs.length,
      profitablePairs: profitablePairs.length,
      totalPairedShares: profitablePairs.reduce((sum, pair) => sum + pair.pairedShares, 0),
      estimatedLockedProfit: profitablePairs.reduce((sum, pair) => sum + pair.estimatedLockedProfit, 0),
      avgSecondsBetween: avg(profitablePairs.map((pair) => pair.secondsBetween)),
      avgEdgeTicks: avg(profitablePairs.map((pair) => pair.edgeTicks)),
      pairs: profitablePairs.sort((a, b) => a.secondsBetween - b.secondsBetween || a.sumPrice - b.sumPrice)
    };
  }

  async runLiveArbMonitor(options: {
    query: string;
    limit: number;
    maxPages: number;
    seconds: number;
    pollSecs: number;
    threshold: number;
    logFile?: string;
  }): Promise<LiveArbRunReport> {
    const startedAt = new Date();
    const markets = await this.findBinaryMarkets(options.query, options.limit, options.maxPages);
    const activeEvents = new Map<string, LiveArbEvent>();
    const completedEvents: LiveArbEvent[] = [];
    let observations = 0;
    let arbObservations = 0;

    if (options.logFile) ensureDir(options.logFile);
    while (Date.now() - startedAt.getTime() < options.seconds * 1000) {
      const batch = await Promise.all(markets.map((market) => this.observeMarket(market, options.threshold)));
      const nowArb = new Set<string>();

      for (const observation of batch) {
        observations++;
        if (options.logFile) appendJsonl(options.logFile, observation);
        if (observation.status !== "ARB" || observation.sumAsk === undefined) continue;
        arbObservations++;
        const key = observation.marketId;
        nowArb.add(key);
        const existing = activeEvents.get(key);
        if (existing) {
          existing.lastSeen = observation.observedAt;
          existing.observations += 1;
          existing.durationMsLowerBound = Math.max(0, Date.parse(existing.lastSeen) - Date.parse(existing.firstSeen));
          existing.maxEdgeTicks = Math.max(existing.maxEdgeTicks, observation.edgeTicks ?? 0);
          existing.maxPairedShares = Math.max(existing.maxPairedShares, observation.pairedShares ?? 0);
          existing.maxEstimatedGrossProfit = Math.max(existing.maxEstimatedGrossProfit, observation.estimatedGrossProfit ?? 0);
        } else {
          activeEvents.set(key, {
            key,
            marketId: observation.marketId,
            slug: observation.slug,
            title: observation.title,
            firstSeen: observation.observedAt,
            lastSeen: observation.observedAt,
            observations: 1,
            durationMsLowerBound: 0,
            maxEdgeTicks: observation.edgeTicks ?? 0,
            maxPairedShares: observation.pairedShares ?? 0,
            maxEstimatedGrossProfit: observation.estimatedGrossProfit ?? 0
          });
        }
      }

      for (const [key, event] of activeEvents) {
        if (!nowArb.has(key)) {
          completedEvents.push(event);
          activeEvents.delete(key);
        }
      }

      await sleep(options.pollSecs * 1000);
    }

    completedEvents.push(...activeEvents.values());
    return {
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      pollSecs: options.pollSecs,
      markets: markets.length,
      observations,
      arbObservations,
      events: completedEvents.sort((a, b) => b.maxEstimatedGrossProfit - a.maxEstimatedGrossProfit),
      logFile: options.logFile
    };
  }

  private async findBinaryMarkets(query: string, limit: number, maxPages: number): Promise<MarketSummary[]> {
    const markets = await this.gamma.fetchActiveEvents(limit, maxPages);
    const normalizedQuery = query.toLowerCase();
    return markets.filter((market) => {
      const text = `${market.title} ${market.slug} ${market.category} ${market.tags.join(" ")}`.toLowerCase();
      return (
        market.active &&
        !market.closed &&
        market.acceptingOrders &&
        market.tokenIds.length >= 2 &&
        market.outcomes.length >= 2 &&
        (!normalizedQuery || text.includes(normalizedQuery))
      );
    });
  }

  private async observeMarket(market: MarketSummary, threshold: number): Promise<LiveArbObservation> {
    const [upToken, downToken] = tokenPairForUpDown(market);
    const observedAt = new Date().toISOString();
    if (!upToken || !downToken) {
      return baseObservation(market, observedAt, "INCOMPLETE_BOOK");
    }

    try {
      const [up, down] = await Promise.all([
        this.clob.getTokenQuote(upToken),
        this.clob.getTokenQuote(downToken)
      ]);
      if (up.bestAsk === undefined || down.bestAsk === undefined) {
        return baseObservation(market, observedAt, "INCOMPLETE_BOOK");
      }
      const sumAsk = up.bestAsk + down.bestAsk;
      const pairedShares = Math.min(up.bestAskSize ?? 0, down.bestAskSize ?? 0);
      const edge = threshold - sumAsk;
      return {
        ...baseObservation(market, observedAt, edge > 0 ? "ARB" : "NO_ARB"),
        upAsk: up.bestAsk,
        downAsk: down.bestAsk,
        sumAsk,
        edgeTicks: Math.round(edge * 100),
        upAskSize: up.bestAskSize,
        downAskSize: down.bestAskSize,
        pairedShares,
        estimatedGrossProfit: Math.max(0, edge * pairedShares)
      };
    } catch (error) {
      return {
        ...baseObservation(market, observedAt, "ERROR"),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

interface PairFill {
  trade: UserActivity;
  remainingShares: number;
}

function toPairFill(trade: UserActivity): PairFill {
  return {
    trade,
    remainingShares: trade.size
  };
}

function groupTrades(trades: UserActivity[]): Map<string, UserActivity[]> {
  const grouped = new Map<string, UserActivity[]>();
  for (const trade of trades) {
    const key = trade.slug ?? trade.eventSlug ?? trade.conditionId ?? "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), trade]);
  }
  return grouped;
}

function tokenPairForUpDown(market: MarketSummary): [string | undefined, string | undefined] {
  const upIndex = market.outcomes.findIndex((outcome) => /^up$|^yes$/i.test(outcome));
  const downIndex = market.outcomes.findIndex((outcome) => /^down$|^no$/i.test(outcome));
  return [market.tokenIds[upIndex >= 0 ? upIndex : 0], market.tokenIds[downIndex >= 0 ? downIndex : 1]];
}

function isUpDownOutcome(outcome?: string): boolean {
  return outcome === "Up" || outcome === "Down";
}

function priceSum(a: UserActivity, b: UserActivity): number {
  return a.price + b.price;
}

function baseObservation(
  market: MarketSummary,
  observedAt: string,
  status: LiveArbObservation["status"]
): LiveArbObservation {
  return {
    marketId: market.marketId,
    slug: market.slug,
    title: market.title,
    observedAt,
    status
  };
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function appendJsonl(file: string, row: unknown): void {
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}
