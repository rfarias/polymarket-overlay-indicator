import { DataQuality, Outcome } from "../exhaustionReversal/types.js";

export interface DistanceToBeatOptions {
  minSamples: number;
  volatilityWindowSec: number;
  slippagePrice: number;
}

export interface DistanceToBeatObservation {
  marketId: string;
  slug: string;
  timeMs: number;
  result: Outcome;
  priceNow: number;
  priceToBeat: number;
  secondsRemaining: number;
  dominantSide: Outcome;
  distanceUsd: number;
  distanceBps: number;
  distanceSigma?: number;
  requiredVelocity: number;
  secondsBand: string;
  distanceSigmaBand: string;
  signedDistanceBpsBand: string;
  upAsk?: number;
  downAsk?: number;
  sourceQuality: DataQuality;
}

export interface DistanceToBeatBucket {
  bucketType: string;
  bucketKey: string;
  samples: number;
  upWins: number;
  downWins: number;
  upWinRate: number;
  downWinRate: number;
  dominantWinRate: number;
  reversalWinRate: number;
  avgUpAsk?: number;
  avgDownAsk?: number;
  avgDominantAsk?: number;
  avgReversalAsk?: number;
  upNetEdge?: number;
  downNetEdge?: number;
  dominantNetEdge?: number;
  reversalNetEdge?: number;
  avgSecondsRemaining: number;
  avgDistanceUsd: number;
  avgDistanceBps: number;
  avgDistanceSigma?: number;
  avgRequiredVelocity: number;
  dataQuality: DataQuality;
  sampleQuality: "OK" | "LOW_SAMPLE";
}

export interface DistanceToBeatReport {
  generatedAt: string;
  options: DistanceToBeatOptions;
  sourceNotes: string[];
  observations: number;
  markets: number;
  buckets: DistanceToBeatBucket[];
  bestReversalBuckets: DistanceToBeatBucket[];
  bestDominantBuckets: DistanceToBeatBucket[];
}
