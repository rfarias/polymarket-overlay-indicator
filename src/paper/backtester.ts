import { PaperTrade } from "./paperTrader.js";
import { Opportunity } from "../types.js";

export interface PaperReport {
  totalSignals: number;
  openTrades: number;
  closedTrades: number;
  simulatedStake: number;
  averageNetEdge: number;
  bySide: Record<string, number>;
  evaluatedSignals?: number;
  totalMtmPnl?: number;
  averageMtmRoi?: number;
  winRate?: number;
  maxDrawdownPerTrade?: number;
  maxRunupPerTrade?: number;
  significance?: string;
}

export interface EvaluatedPaperTrade {
  trade: PaperTrade;
  observations: number;
  latestPrice?: number;
  latestValue?: number;
  mtmPnl?: number;
  mtmRoi?: number;
  maxPnl?: number;
  minPnl?: number;
}

export function buildPaperReport(trades: PaperTrade[]): PaperReport {
  const totalEdge = trades.reduce((sum, trade) => sum + trade.netEdge, 0);
  return {
    totalSignals: trades.length,
    openTrades: trades.filter((trade) => trade.status === "OPEN").length,
    closedTrades: trades.filter((trade) => trade.status === "CLOSED").length,
    simulatedStake: trades.reduce((sum, trade) => sum + trade.stake, 0),
    averageNetEdge: trades.length ? totalEdge / trades.length : 0,
    bySide: trades.reduce<Record<string, number>>((acc, trade) => {
      acc[trade.side] = (acc[trade.side] ?? 0) + 1;
      return acc;
    }, {})
  };
}

export function evaluatePaperTrades(
  trades: PaperTrade[],
  snapshotsByMarket: Map<string, Opportunity[]>
): EvaluatedPaperTrade[] {
  return trades.map((trade) => {
    const snapshots = snapshotsByMarket.get(trade.marketId) ?? [];
    const observations = snapshots
      .map((snapshot) => priceForSide(trade.side, snapshot))
      .filter((price): price is number => price !== undefined && Number.isFinite(price));
    const pnls = observations.map((price) => pnlForPrice(trade, price));
    const latestPrice = observations.at(-1);
    const latestPnl = pnls.at(-1);

    return {
      trade,
      observations: observations.length,
      latestPrice,
      latestValue: latestPnl === undefined ? undefined : trade.stake + latestPnl,
      mtmPnl: latestPnl,
      mtmRoi: latestPnl === undefined ? undefined : latestPnl / trade.stake,
      maxPnl: pnls.length ? Math.max(...pnls) : undefined,
      minPnl: pnls.length ? Math.min(...pnls) : undefined
    };
  });
}

export function buildEvaluatedPaperReport(evaluated: EvaluatedPaperTrade[]): PaperReport {
  const trades = evaluated.map((item) => item.trade);
  const base = buildPaperReport(trades);
  const withPnl = evaluated.filter((item) => item.mtmPnl !== undefined && item.mtmRoi !== undefined);
  const totalMtmPnl = withPnl.reduce((sum, item) => sum + (item.mtmPnl ?? 0), 0);
  const averageMtmRoi = withPnl.length
    ? withPnl.reduce((sum, item) => sum + (item.mtmRoi ?? 0), 0) / withPnl.length
    : 0;
  const wins = withPnl.filter((item) => (item.mtmPnl ?? 0) > 0).length;

  return {
    ...base,
    evaluatedSignals: withPnl.length,
    totalMtmPnl,
    averageMtmRoi,
    winRate: withPnl.length ? wins / withPnl.length : 0,
    maxDrawdownPerTrade: withPnl.length ? Math.min(...withPnl.map((item) => item.minPnl ?? 0)) : 0,
    maxRunupPerTrade: withPnl.length ? Math.max(...withPnl.map((item) => item.maxPnl ?? 0)) : 0,
    significance: significanceLabel(withPnl.length, averageMtmRoi)
  };
}

function priceForSide(side: PaperTrade["side"], snapshot: Opportunity): number | undefined {
  if (side === "BUY_YES") return snapshot.orderBook.bestYesBid;
  if (side === "BUY_NO") return snapshot.orderBook.bestNoBid;
  if (side === "SELL_YES") return snapshot.orderBook.bestYesAsk;
  return snapshot.orderBook.bestNoAsk;
}

function pnlForPrice(trade: PaperTrade, markPrice: number): number {
  if (trade.side === "BUY_YES" || trade.side === "BUY_NO") {
    const shares = trade.stake / trade.price;
    return shares * markPrice - trade.stake;
  }

  const liabilityPerShare = Math.max(0.0001, 1 - trade.price);
  const shares = trade.stake / liabilityPerShare;
  return shares * (trade.price - markPrice);
}

function significanceLabel(sampleSize: number, averageRoi: number): string {
  if (sampleSize < 30) return "INSUFFICIENT_SAMPLE_UNDER_30";
  if (sampleSize < 100) return Math.abs(averageRoi) >= 0.03 ? "EARLY_SIGNAL_NEEDS_MORE_DATA" : "NO_CLEAR_EDGE_YET";
  if (averageRoi >= 0.03) return "POSITIVE_EDGE_CANDIDATE";
  if (averageRoi <= -0.03) return "NEGATIVE_EDGE_CANDIDATE";
  return "NO_CLEAR_EDGE_YET";
}
