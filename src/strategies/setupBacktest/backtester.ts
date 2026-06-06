import {
  BtcPricePoint,
  DataQuality,
  ExhaustionBacktestDataset,
  Outcome,
  PolymarketOddsSnapshot,
  UpDownMarketWindow
} from "../exhaustionReversal/types.js";
import { SetupBacktestReport, SetupDefinition, SetupSummary, SetupTrade } from "./types.js";

export function runSetupBacktest(dataset: ExhaustionBacktestDataset, setups: SetupDefinition[]): SetupBacktestReport {
  const btcIndex = new BtcSeriesIndex([...dataset.btcPrices].sort((a, b) => a.timeMs - b.timeMs));
  const oddsByMarket = groupOddsByMarket(dataset.odds);
  const trades = setups.flatMap((setup) => simulateSetup(dataset.markets, btcIndex, oddsByMarket, setup));
  const summaries = setups.map((setup) => summarizeSetup(setup, trades.filter((trade) => trade.setupName === setup.name)));
  return {
    generatedAt: new Date().toISOString(),
    sourceNotes: [
      "Backtests candidate setup definitions against the canonical BTC 5m dataset.",
      "Signals only use BTC and odds snapshots at or before signal/fill time.",
      "Current default catalog is derived from distance-to-beat stability triage and includes reversal controls.",
      "Binance-enriched datasets remain EXCHANGE_PROXY and must not be treated as Chainlink/Data Streams ground truth."
    ],
    setups,
    summaries,
    trades,
    bestSetups: [...summaries].filter((row) => row.trades >= 20).sort((a, b) => b.evPerTrade - a.evPerTrade).slice(0, 20)
  };
}

function simulateSetup(
  markets: UpDownMarketWindow[],
  btcIndex: BtcSeriesIndex,
  oddsByMarket: Map<string, PolymarketOddsSnapshot[]>,
  setup: SetupDefinition
): SetupTrade[] {
  const trades: SetupTrade[] = [];
  for (const market of markets) {
    if (!market.result || !Number.isFinite(market.priceToBeat) || market.priceToBeat <= 0) continue;
    const oddsRows = oddsByMarket.get(market.marketId) ?? [];
    for (const odds of oddsRows) {
      const signalTimeMs = odds.timeMs;
      if (signalTimeMs < market.startTimeMs || signalTimeMs > market.endTimeMs) continue;
      const secondsRemaining = (market.endTimeMs - signalTimeMs) / 1000;
      if (!inRange(secondsRemaining, setup.secondsRemaining)) continue;

      const btc = btcIndex.lastAtOrBefore(signalTimeMs);
      if (!btc) continue;
      const metrics = distanceMetrics(btc, market, btcIndex.rollingStdAt(signalTimeMs, 60_000), secondsRemaining);
      if (setup.signedDistanceBps && !inRange(metrics.signedDistanceBps, setup.signedDistanceBps)) continue;
      if (setup.distanceSigma && (metrics.distanceSigma === undefined || !inRange(metrics.distanceSigma, setup.distanceSigma))) continue;
      const crossing = crossingMetrics(btcIndex.pointsBetween(market.startTimeMs, signalTimeMs), market.priceToBeat);
      if (setup.minCrosses !== undefined && crossing.crossesInWindow < setup.minCrosses) continue;
      if (setup.maxCrosses !== undefined && crossing.crossesInWindow > setup.maxCrosses) continue;
      if (setup.maxSecondsSinceCross !== undefined) {
        if (crossing.secondsSinceLastCross === undefined || crossing.secondsSinceLastCross > setup.maxSecondsSinceCross) continue;
      }
      if (setup.lastCrossDirection !== undefined && crossing.lastCrossDirection !== setup.lastCrossDirection) continue;
      const momentumBps = setup.momentumWindowSec === undefined
        ? undefined
        : btcIndex.momentumBpsAt(signalTimeMs, setup.momentumWindowSec * 1000);
      if (setup.minMomentumBps !== undefined || setup.maxMomentumBps !== undefined || setup.momentumDirection !== undefined) {
        if (momentumBps === undefined) continue;
        const directedMomentum = directedMomentumBps(momentumBps, metrics.dominantSide, setup.momentumDirection ?? "dominant");
        if (setup.minMomentumBps !== undefined && directedMomentum < setup.minMomentumBps) continue;
        if (setup.maxMomentumBps !== undefined && directedMomentum > setup.maxMomentumBps) continue;
      }

      const sideBought = setup.sideMode === "dominant" ? metrics.dominantSide : opposite(metrics.dominantSide);
      const fillOdds = lastOddsAtOrBefore(oddsRows, signalTimeMs + setup.latencyMs);
      const entryAsk = askFor(fillOdds, sideBought);
      if (entryAsk === undefined || entryAsk <= 0 || entryAsk >= 1) continue;
      if (setup.minEntryAsk !== undefined && entryAsk < setup.minEntryAsk) continue;
      if (entryAsk > setup.maxEntryAsk) continue;

      const entryPrice = Math.min(0.99, entryAsk + setup.slippagePrice);
      const win = sideBought === market.result;
      trades.push({
        setupName: setup.name,
        family: setup.family,
        marketId: market.marketId,
        slug: market.slug,
        signalTimeMs,
        secondsRemaining,
        sideBought,
        dominantSide: metrics.dominantSide,
        finalResult: market.result,
        win,
        entryAsk,
        entryPrice,
        netPnl: win ? 1 - entryPrice : -entryPrice,
        priceNow: btc.price,
        priceToBeat: market.priceToBeat,
        signedDistanceBps: metrics.signedDistanceBps,
        distanceBps: metrics.distanceBps,
        distanceSigma: metrics.distanceSigma,
        requiredVelocity: metrics.requiredVelocity,
        crossesInWindow: crossing.crossesInWindow,
        secondsSinceLastCross: crossing.secondsSinceLastCross,
        lastCrossDirection: crossing.lastCrossDirection,
        momentumBps,
        dataQuality: qualityFromOdds(fillOdds)
      });
      if (setup.oneTradePerMarket) break;
    }
  }
  return trades;
}

function distanceMetrics(
  btc: BtcPricePoint,
  market: UpDownMarketWindow,
  rollingStd: number | undefined,
  secondsRemaining: number
): {
  dominantSide: Outcome;
  signedDistanceBps: number;
  distanceBps: number;
  distanceSigma?: number;
  requiredVelocity: number;
} {
  const signedDistanceUsd = btc.price - market.priceToBeat;
  const distanceUsd = Math.abs(signedDistanceUsd);
  const signedDistanceBps = btc.price > 0 ? (signedDistanceUsd / btc.price) * 10_000 : 0;
  return {
    dominantSide: btc.price >= market.priceToBeat ? "UP" : "DOWN",
    signedDistanceBps,
    distanceBps: Math.abs(signedDistanceBps),
    distanceSigma: rollingStd && rollingStd > 0 ? distanceUsd / rollingStd : undefined,
    requiredVelocity: secondsRemaining > 0 ? distanceUsd / secondsRemaining : Number.POSITIVE_INFINITY
  };
}

function groupOddsByMarket(odds: PolymarketOddsSnapshot[]): Map<string, PolymarketOddsSnapshot[]> {
  const groups = new Map<string, PolymarketOddsSnapshot[]>();
  for (const row of odds) {
    const rows = groups.get(row.marketId) ?? [];
    rows.push(row);
    groups.set(row.marketId, rows);
  }
  for (const rows of groups.values()) rows.sort((a, b) => a.timeMs - b.timeMs);
  return groups;
}

function lastOddsAtOrBefore(rows: PolymarketOddsSnapshot[], timeMs: number): PolymarketOddsSnapshot | undefined {
  const index = upperBound(rows.map((row) => row.timeMs), timeMs) - 1;
  return index >= 0 ? rows[index] : undefined;
}

function askFor(odds: PolymarketOddsSnapshot | undefined, side: Outcome): number | undefined {
  return side === "UP" ? odds?.upAsk : odds?.downAsk;
}

function summarizeSetup(setup: SetupDefinition, trades: SetupTrade[]): SetupSummary {
  const wins = trades.filter((trade) => trade.win).length;
  const totalPnl = sum(trades.map((trade) => trade.netPnl));
  const entryCost = sum(trades.map((trade) => trade.entryPrice));
  const gains = sum(trades.filter((trade) => trade.netPnl > 0).map((trade) => trade.netPnl));
  const losses = Math.abs(sum(trades.filter((trade) => trade.netPnl < 0).map((trade) => trade.netPnl)));
  return {
    setupName: setup.name,
    family: setup.family,
    trades: trades.length,
    wins,
    winRate: trades.length ? wins / trades.length : 0,
    avgEntryPrice: trades.length ? entryCost / trades.length : 0,
    evPerTrade: trades.length ? totalPnl / trades.length : 0,
    roi: entryCost > 0 ? totalPnl / entryCost : 0,
    totalPnl,
    maxDrawdown: maxDrawdown(trades.map((trade) => trade.netPnl)),
    profitFactor: losses > 0 ? gains / losses : gains > 0 ? Number.POSITIVE_INFINITY : 0,
    avgSecondsRemaining: average(trades.map((trade) => trade.secondsRemaining)),
    avgDistanceBps: average(trades.map((trade) => trade.distanceBps)),
    avgDistanceSigma: averageOptional(trades.map((trade) => trade.distanceSigma)),
    avgCrossesInWindow: average(trades.map((trade) => trade.crossesInWindow)),
    avgSecondsSinceLastCross: averageOptional(trades.map((trade) => trade.secondsSinceLastCross)),
    avgMomentumBps: averageOptional(trades.map((trade) => trade.momentumBps)),
    dataQuality: combinedQuality(trades.map((trade) => trade.dataQuality))
  };
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value < range.max;
}

function opposite(side: Outcome): Outcome {
  return side === "UP" ? "DOWN" : "UP";
}

function qualityFromOdds(odds: PolymarketOddsSnapshot | undefined): DataQuality {
  if (odds?.source === "book") return "EXCHANGE_PROXY";
  if (odds?.source === "prices-history" || odds?.source === "trade") return "ODDS_PROXY";
  return "LOW_CONFIDENCE";
}

function combinedQuality(values: DataQuality[]): DataQuality {
  if (values.length === 0 || values.includes("LOW_CONFIDENCE")) return "LOW_CONFIDENCE";
  if (values.includes("ODDS_PROXY")) return "ODDS_PROXY";
  if (values.includes("EXCHANGE_PROXY")) return "EXCHANGE_PROXY";
  return "CHAINLINK_ALIGNED";
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function averageOptional(values: Array<number | undefined>): number | undefined {
  const clean = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  return clean.length ? average(clean) : undefined;
}

function maxDrawdown(pnls: number[]): number {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const pnl of pnls) {
    equity += pnl;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return drawdown;
}

class BtcSeriesIndex {
  private readonly points: BtcPricePoint[];
  private readonly times: number[];
  private readonly prefixSum: number[];
  private readonly prefixSqSum: number[];

  constructor(points: BtcPricePoint[]) {
    this.points = points.filter((point) => Number.isFinite(point.timeMs) && Number.isFinite(point.price) && point.price > 0);
    this.times = this.points.map((point) => point.timeMs);
    this.prefixSum = [0];
    this.prefixSqSum = [0];
    for (const point of this.points) {
      this.prefixSum.push((this.prefixSum[this.prefixSum.length - 1] ?? 0) + point.price);
      this.prefixSqSum.push((this.prefixSqSum[this.prefixSqSum.length - 1] ?? 0) + point.price ** 2);
    }
  }

  lastAtOrBefore(timeMs: number): BtcPricePoint | undefined {
    const index = upperBound(this.times, timeMs) - 1;
    return index >= 0 ? this.points[index] : undefined;
  }

  rollingStdAt(timeMs: number, windowMs: number): number | undefined {
    const endExclusive = upperBound(this.times, timeMs);
    const startInclusive = lowerBound(this.times, timeMs - windowMs);
    const count = endExclusive - startInclusive;
    if (count < 2) return undefined;
    const sumValue = (this.prefixSum[endExclusive] ?? 0) - (this.prefixSum[startInclusive] ?? 0);
    const sqSum = (this.prefixSqSum[endExclusive] ?? 0) - (this.prefixSqSum[startInclusive] ?? 0);
    const mean = sumValue / count;
    const variance = Math.max(0, sqSum / count - mean ** 2);
    return Math.sqrt(variance);
  }

  momentumBpsAt(timeMs: number, windowMs: number): number | undefined {
    const current = this.lastAtOrBefore(timeMs);
    const previous = this.lastAtOrBefore(timeMs - windowMs);
    if (!current || !previous || previous.price <= 0) return undefined;
    return ((current.price - previous.price) / previous.price) * 10_000;
  }

  pointsBetween(startMs: number, endMs: number): BtcPricePoint[] {
    const start = lowerBound(this.times, startMs);
    const end = upperBound(this.times, endMs);
    return this.points.slice(start, end);
  }
}

function crossingMetrics(points: BtcPricePoint[], priceToBeat: number): {
  crossesInWindow: number;
  secondsSinceLastCross?: number;
  lastCrossDirection?: "UP" | "DOWN";
} {
  let previousSide: Outcome | undefined;
  let crossesInWindow = 0;
  let lastCrossTimeMs: number | undefined;
  let lastCrossDirection: "UP" | "DOWN" | undefined;

  for (const point of points) {
    const side: Outcome = point.price >= priceToBeat ? "UP" : "DOWN";
    if (previousSide !== undefined && side !== previousSide) {
      crossesInWindow++;
      lastCrossTimeMs = point.timeMs;
      lastCrossDirection = side;
    }
    previousSide = side;
  }

  const lastPoint = points[points.length - 1];
  return {
    crossesInWindow,
    secondsSinceLastCross: lastPoint && lastCrossTimeMs !== undefined ? (lastPoint.timeMs - lastCrossTimeMs) / 1000 : undefined,
    lastCrossDirection
  };
}

function directedMomentumBps(momentumBps: number, dominantSide: Outcome, direction: "dominant" | "reversal"): number {
  const dominantSigned = dominantSide === "UP" ? momentumBps : -momentumBps;
  return direction === "dominant" ? dominantSigned : -dominantSigned;
}

function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((values[mid] ?? 0) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((values[mid] ?? 0) <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}
