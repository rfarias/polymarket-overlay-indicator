import { DataQuality, Outcome } from "../exhaustionReversal/types.js";

export interface OddsCalibrationOptions {
  slippagePrice: number;
  minSamples: number;
  distanceVolWindowSec: number;
}

export interface OddsCalibrationObservation {
  marketId: string;
  slug: string;
  timeMs: number;
  side: Outcome;
  ask: number;
  win: boolean;
  secondsRemaining: number;
  priceNow?: number;
  priceToBeat?: number;
  distanceBps?: number;
  distanceSigma?: number;
  oddBand: string;
  secondsBand: string;
  distanceSigmaBand: string;
  sourceQuality: DataQuality;
}

export interface OddsCalibrationBucket {
  bucketType: string;
  bucketKey: string;
  samples: number;
  wins: number;
  winRate: number;
  avgOdd: number;
  avgNetEntry: number;
  grossEdge: number;
  netEdge: number;
  calibrationError: number;
  brierScore: number;
  avgSecondsRemaining: number;
  avgDistanceBps?: number;
  avgDistanceSigma?: number;
  dataQuality: DataQuality;
  sampleQuality: "OK" | "LOW_SAMPLE";
}

export interface OddsCalibrationReport {
  generatedAt: string;
  options: OddsCalibrationOptions;
  sourceNotes: string[];
  observations: number;
  markets: number;
  buckets: OddsCalibrationBucket[];
  bestBuckets: OddsCalibrationBucket[];
  worstBuckets: OddsCalibrationBucket[];
}
