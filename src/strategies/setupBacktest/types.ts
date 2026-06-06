import { DataQuality, Outcome } from "../exhaustionReversal/types.js";

export type SetupFamily =
  | "distance_dominance"
  | "distance_reversal_control"
  | "crossing_probability"
  | "near_target_locked"
  | "lag_btc_vs_odds"
  | "late_momentum_continuation";

export interface SetupDefinition {
  name: string;
  family: SetupFamily;
  description: string;
  sideMode: "dominant" | "reversal";
  secondsRemaining: { min: number; max: number };
  signedDistanceBps?: { min: number; max: number };
  distanceSigma?: { min: number; max: number };
  minCrosses?: number;
  maxCrosses?: number;
  maxSecondsSinceCross?: number;
  lastCrossDirection?: "UP" | "DOWN";
  momentumWindowSec?: number;
  minMomentumBps?: number;
  maxMomentumBps?: number;
  momentumDirection?: "dominant" | "reversal";
  maxEntryAsk: number;
  minEntryAsk?: number;
  latencyMs: number;
  slippagePrice: number;
  oneTradePerMarket: boolean;
}

export interface SetupTrade {
  setupName: string;
  family: SetupFamily;
  marketId: string;
  slug: string;
  signalTimeMs: number;
  secondsRemaining: number;
  sideBought: Outcome;
  dominantSide: Outcome;
  finalResult: Outcome;
  win: boolean;
  entryAsk: number;
  entryPrice: number;
  netPnl: number;
  priceNow: number;
  priceToBeat: number;
  signedDistanceBps: number;
  distanceBps: number;
  distanceSigma?: number;
  requiredVelocity: number;
  crossesInWindow: number;
  secondsSinceLastCross?: number;
  lastCrossDirection?: "UP" | "DOWN";
  momentumBps?: number;
  dataQuality: DataQuality;
}

export interface SetupSummary {
  setupName: string;
  family: SetupFamily;
  trades: number;
  wins: number;
  winRate: number;
  avgEntryPrice: number;
  evPerTrade: number;
  roi: number;
  totalPnl: number;
  maxDrawdown: number;
  profitFactor: number;
  avgSecondsRemaining: number;
  avgDistanceBps: number;
  avgDistanceSigma?: number;
  avgCrossesInWindow: number;
  avgSecondsSinceLastCross?: number;
  avgMomentumBps?: number;
  dataQuality: DataQuality;
}

export interface SetupBacktestReport {
  generatedAt: string;
  sourceNotes: string[];
  setups: SetupDefinition[];
  summaries: SetupSummary[];
  trades: SetupTrade[];
  bestSetups: SetupSummary[];
}
