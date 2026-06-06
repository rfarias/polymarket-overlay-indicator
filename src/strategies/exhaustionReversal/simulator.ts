import { lastAtOrBefore, pointsBetween } from "./indicators.js";
import { generateExhaustionSignal } from "./signalGenerator.js";
import {
  ExhaustionBacktestDataset,
  ExhaustionBacktestReport,
  ExhaustionParameters,
  ExhaustionSummary,
  ExhaustionTrade,
  BtcPricePoint,
  Outcome,
  PolymarketOddsSnapshot,
  UpDownMarketWindow
} from "./types.js";

export function runExhaustionBacktest(dataset: ExhaustionBacktestDataset, params: ExhaustionParameters[]): ExhaustionBacktestReport {
  const btcPrices = [...dataset.btcPrices].sort((a, b) => a.timeMs - b.timeMs);
  const odds = [...dataset.odds].sort((a, b) => a.timeMs - b.timeMs);
  const trades = params.flatMap((paramSet) => simulateParamSet(dataset.markets, btcPrices, odds, paramSet));
  const summaries = params.map((paramSet) => summarizeTrades(paramSet.name, trades.filter((trade) => trade.parameterName === paramSet.name)));
  return {
    generatedAt: new Date().toISOString(),
    sourceNotes: [
      "No indicator uses future BTC samples after the signal timestamp.",
      "Final result uses market.result when provided; otherwise it resolves from final BTC price versus priceToBeat.",
      "Odds must be historical ask snapshots for reliable EV. Missing or proxy odds should be treated as low confidence."
    ],
    summaries,
    trades,
    bestParameters: [...summaries].filter((row) => row.trades >= 20).sort((a, b) => b.evPerTrade - a.evPerTrade).slice(0, 20)
  };
}

function simulateParamSet(
  markets: UpDownMarketWindow[],
  btcPrices: BtcPricePoint[],
  odds: PolymarketOddsSnapshot[],
  params: ExhaustionParameters
): ExhaustionTrade[] {
  const trades: ExhaustionTrade[] = [];
  for (const market of markets) {
    const marketPrices = pointsBetween(btcPrices, market.startTimeMs, market.endTimeMs);
    if (marketPrices.length < 5) continue;
    for (const point of marketPrices) {
      const oddsAtFill = oddsForMarketAt(odds, market.marketId, point.timeMs + params.latencyMs);
      const signal = generateExhaustionSignal({ market, now: point, priceHistory: btcPrices, odds: oddsAtFill, params });
      if (!signal.shouldEnter || !signal.sideToBuy || signal.entryAsk === undefined) continue;
      const finalResult = market.result ?? resolveFromFinalPrice(market, btcPrices);
      if (!finalResult) break;
      const entryPrice = Math.min(0.99, signal.entryAsk + params.slippagePrice);
      const askSize = signal.sideToBuy === "UP" ? oddsAtFill?.upAskSize : oddsAtFill?.downAskSize;
      const fillRatio = askSize === undefined ? 1 : askSize > 0 ? 1 : 0;
      if (fillRatio <= 0) break;
      const win = signal.sideToBuy === finalResult;
      const grossPnl = win ? 1 - signal.entryAsk : -signal.entryAsk;
      const netPnl = win ? 1 - entryPrice : -entryPrice;
      const excursion = excursionFromSignal(marketPrices, point.timeMs, point.price, signal.sideToBuy);
      trades.push({
        parameterName: params.name,
        marketId: market.marketId,
        slug: market.slug,
        signalTimeMs: point.timeMs,
        secondsRemaining: signal.metrics.secondsRemaining,
        priceToBeat: market.priceToBeat,
        priceNow: point.price,
        dominantSide: signal.metrics.dominantSide,
        sideBought: signal.sideToBuy,
        entryPrice,
        finalResult,
        win,
        grossPnl,
        netPnl,
        maxAdverseMoveUsd: excursion.maxAdverseMoveUsd,
        maxFavorableMoveUsd: excursion.maxFavorableMoveUsd,
        wouldHaveEarlyProfit: excursion.crossedBeatBeforeEnd,
        heldToResolution: true,
        fillRatio,
        dataQuality: signal.dataQuality,
        zPrice: signal.metrics.zPrice,
        zReturn: signal.metrics.zReturn,
        zVolume: signal.metrics.zVolume,
        aggressionRatio: signal.metrics.aggressionRatio,
        distanceBps: signal.metrics.distance.distanceBps,
        distanceSigma: signal.metrics.distance.distanceSigma,
        requiredVelocity: signal.metrics.distance.requiredVelocity
      });
      break;
    }
  }
  return trades;
}

function oddsForMarketAt(odds: PolymarketOddsSnapshot[], marketId: string, timeMs: number): PolymarketOddsSnapshot | undefined {
  let best: PolymarketOddsSnapshot | undefined;
  for (const row of odds) {
    if (row.marketId !== marketId) continue;
    if (row.timeMs > timeMs) break;
    best = row;
  }
  return best;
}

function resolveFromFinalPrice(market: UpDownMarketWindow, btcPrices: BtcPricePoint[]): Outcome | undefined {
  const final = lastAtOrBefore(btcPrices, market.endTimeMs);
  if (!final) return undefined;
  return final.price >= market.priceToBeat ? "UP" : "DOWN";
}

function excursionFromSignal(
  marketPrices: Array<{ timeMs: number; price: number }>,
  signalTimeMs: number,
  entryPrice: number,
  side: Outcome
): { maxAdverseMoveUsd: number; maxFavorableMoveUsd: number; crossedBeatBeforeEnd: boolean } {
  const after = marketPrices.filter((point) => point.timeMs >= signalTimeMs);
  const signedMoves = after.map((point) => side === "UP" ? point.price - entryPrice : entryPrice - point.price);
  return {
    maxAdverseMoveUsd: Math.abs(Math.min(0, ...signedMoves)),
    maxFavorableMoveUsd: Math.max(0, ...signedMoves),
    crossedBeatBeforeEnd: signedMoves.some((move) => move > 0)
  };
}

function summarizeTrades(parameterName: string, trades: ExhaustionTrade[]): ExhaustionSummary {
  const wins = trades.filter((trade) => trade.win).length;
  const totalPnl = sum(trades.map((trade) => trade.netPnl));
  const losses = Math.abs(sum(trades.filter((trade) => trade.netPnl < 0).map((trade) => trade.netPnl)));
  const gains = sum(trades.filter((trade) => trade.netPnl > 0).map((trade) => trade.netPnl));
  return {
    parameterName,
    trades: trades.length,
    wins,
    winRate: trades.length ? wins / trades.length : 0,
    avgEntryPrice: trades.length ? sum(trades.map((trade) => trade.entryPrice)) / trades.length : 0,
    evPerTrade: trades.length ? totalPnl / trades.length : 0,
    roi: trades.length ? totalPnl / sum(trades.map((trade) => trade.entryPrice)) : 0,
    totalPnl,
    maxDrawdown: maxDrawdown(trades.map((trade) => trade.netPnl)),
    sharpe: sharpe(trades.map((trade) => trade.netPnl)),
    profitFactor: losses > 0 ? gains / losses : gains > 0 ? Number.POSITIVE_INFINITY : 0
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
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

function sharpe(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = sum(values) / values.length;
  const variance = sum(values.map((value) => (value - mean) ** 2)) / values.length;
  const std = Math.sqrt(variance);
  return std > 0 ? mean / std : 0;
}
