export type Outcome = "UP" | "DOWN";
export type DataQuality = "CHAINLINK_ALIGNED" | "EXCHANGE_PROXY" | "ODDS_PROXY" | "LOW_CONFIDENCE";

export interface BtcPricePoint {
  timeMs: number;
  price: number;
  volume?: number;
  buyVolume?: number;
  sellVolume?: number;
  source?: "chainlink" | "binance" | "coinbase" | "other";
}

export interface PolymarketOddsSnapshot {
  marketId: string;
  timeMs: number;
  upBid?: number;
  upAsk?: number;
  downBid?: number;
  downAsk?: number;
  upAskSize?: number;
  downAskSize?: number;
  upTopLiquidity?: number;
  downTopLiquidity?: number;
  source?: "book" | "prices-history" | "trade" | "proxy";
}

export interface UpDownMarketWindow {
  marketId: string;
  slug: string;
  startTimeMs: number;
  endTimeMs: number;
  priceToBeat: number;
  result?: Outcome;
  upTokenId?: string;
  downTokenId?: string;
}

export interface ExhaustionBacktestDataset {
  markets: UpDownMarketWindow[];
  btcPrices: BtcPricePoint[];
  odds: PolymarketOddsSnapshot[];
}

export interface SecondsRemainingBand {
  min: number;
  max: number;
}

export interface ExhaustionParameters {
  name: string;
  zThreshold: number;
  priceWindowSec: number;
  returnWindowSec: number;
  maxEntryPrice: number;
  secondsRemaining: SecondsRemainingBand;
  maxDistanceSigma?: number;
  maxRequiredVelocity?: number;
  minVolumeZ?: number;
  minAggressionRatio?: number;
  requireDeceleration: boolean;
  minLiquidity?: number;
  maxSpread?: number;
  latencyMs: number;
  slippagePrice: number;
}

export interface DistanceMetrics {
  distanceUsd: number;
  distanceBps: number;
  distanceSigma?: number;
  requiredVelocity: number;
}

export interface IndicatorSnapshot {
  priceNow: number;
  priceToBeat: number;
  dominantSide: Outcome;
  reversalSide: Outcome;
  secondsRemaining: number;
  zPrice?: number;
  zReturn?: number;
  rollingMeanPrice?: number;
  rollingStdPrice?: number;
  rollingStdReturn?: number;
  volume?: number;
  zVolume?: number;
  aggressionRatio?: number;
  decelerating: boolean;
  distance: DistanceMetrics;
}

export interface ExhaustionSignal {
  shouldEnter: boolean;
  sideToBuy?: Outcome;
  entryAsk?: number;
  reason: string;
  metrics: IndicatorSnapshot;
  confidenceScore: number;
  dataQuality: DataQuality;
}

export interface ExhaustionTrade {
  parameterName: string;
  marketId: string;
  slug: string;
  signalTimeMs: number;
  secondsRemaining: number;
  priceToBeat: number;
  priceNow: number;
  dominantSide: Outcome;
  sideBought: Outcome;
  entryPrice: number;
  finalResult: Outcome;
  win: boolean;
  grossPnl: number;
  netPnl: number;
  maxAdverseMoveUsd: number;
  maxFavorableMoveUsd: number;
  wouldHaveEarlyProfit: boolean;
  heldToResolution: boolean;
  fillRatio: number;
  dataQuality: DataQuality;
  zPrice?: number;
  zReturn?: number;
  zVolume?: number;
  aggressionRatio?: number;
  distanceBps: number;
  distanceSigma?: number;
  requiredVelocity: number;
}

export interface ExhaustionSummary {
  parameterName: string;
  trades: number;
  wins: number;
  winRate: number;
  avgEntryPrice: number;
  evPerTrade: number;
  roi: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpe: number;
  profitFactor: number;
}

export interface ExhaustionBacktestReport {
  generatedAt: string;
  sourceNotes: string[];
  summaries: ExhaustionSummary[];
  trades: ExhaustionTrade[];
  bestParameters: ExhaustionSummary[];
}
