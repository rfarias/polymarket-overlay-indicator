import {
  distanceToBeat,
  momentumDeceleration,
  pointsBetween,
  requiredVelocity,
  sideFromBeat,
  volumeAggression,
  zScorePrice,
  zScoreReturn
} from "./indicators.js";
import {
  BtcPricePoint,
  DataQuality,
  ExhaustionParameters,
  ExhaustionSignal,
  PolymarketOddsSnapshot,
  UpDownMarketWindow
} from "./types.js";

export function generateExhaustionSignal(input: {
  market: UpDownMarketWindow;
  now: BtcPricePoint;
  priceHistory: BtcPricePoint[];
  odds?: PolymarketOddsSnapshot;
  params: ExhaustionParameters;
}): ExhaustionSignal {
  const { market, now, priceHistory, odds, params } = input;
  const secondsRemaining = (market.endTimeMs - now.timeMs) / 1000;
  const windowPoints = pointsBetween(priceHistory, now.timeMs - params.priceWindowSec * 1000, now.timeMs);
  const { dominant, reversal } = sideFromBeat(now.price, market.priceToBeat);
  const priceZ = zScorePrice(windowPoints, now.price);
  const retZ = zScoreReturn(priceHistory, now.timeMs, params.returnWindowSec * 1000);
  const distance = distanceToBeat(now.price, market.priceToBeat, priceZ.std);
  distance.requiredVelocity = requiredVelocity(distance.distanceUsd, secondsRemaining);
  const volume = volumeAggression(windowPoints);
  const decelerating = momentumDeceleration(priceHistory, now.timeMs, dominant);
  const entryAsk = reversal === "UP" ? odds?.upAsk : odds?.downAsk;
  const spread = reversal === "UP" ? spreadOf(odds?.upBid, odds?.upAsk) : spreadOf(odds?.downBid, odds?.downAsk);
  const liquidity = reversal === "UP" ? odds?.upTopLiquidity ?? odds?.upAskSize : odds?.downTopLiquidity ?? odds?.downAskSize;
  const dataQuality = qualityOf(priceHistory, odds);
  const metrics = {
    priceNow: now.price,
    priceToBeat: market.priceToBeat,
    dominantSide: dominant,
    reversalSide: reversal,
    secondsRemaining,
    zPrice: priceZ.z,
    zReturn: retZ.z,
    rollingMeanPrice: priceZ.mean,
    rollingStdPrice: priceZ.std,
    rollingStdReturn: retZ.std,
    volume: volume.volume,
    zVolume: volume.zVolume,
    aggressionRatio: volume.aggressionRatio,
    decelerating,
    distance
  };

  const zOk = Math.abs(priceZ.z ?? 0) >= params.zThreshold || Math.abs(retZ.z ?? 0) >= params.zThreshold;
  if (!zOk) return reject("z_below_threshold", metrics, dataQuality);
  if (secondsRemaining < params.secondsRemaining.min || secondsRemaining > params.secondsRemaining.max) {
    return reject("outside_seconds_remaining_band", metrics, dataQuality);
  }
  if (entryAsk === undefined) return reject("missing_reversal_ask", metrics, dataQuality);
  if (entryAsk > params.maxEntryPrice) return reject("entry_ask_above_limit", metrics, dataQuality);
  if (params.maxSpread !== undefined && (spread === undefined || spread > params.maxSpread)) {
    return reject("spread_above_limit", metrics, dataQuality);
  }
  if (params.minLiquidity !== undefined && (liquidity === undefined || liquidity < params.minLiquidity)) {
    return reject("liquidity_below_limit", metrics, dataQuality);
  }
  if (params.maxDistanceSigma !== undefined && (distance.distanceSigma === undefined || distance.distanceSigma > params.maxDistanceSigma)) {
    return reject("distance_sigma_above_limit", metrics, dataQuality);
  }
  if (params.maxRequiredVelocity !== undefined && distance.requiredVelocity > params.maxRequiredVelocity) {
    return reject("required_velocity_above_limit", metrics, dataQuality);
  }
  if (params.minVolumeZ !== undefined && (volume.zVolume === undefined || volume.zVolume < params.minVolumeZ)) {
    return reject("volume_z_below_limit", metrics, dataQuality);
  }
  if (params.minAggressionRatio !== undefined && (volume.aggressionRatio === undefined || volume.aggressionRatio < params.minAggressionRatio)) {
    return reject("aggression_ratio_below_limit", metrics, dataQuality);
  }
  if (params.requireDeceleration && !decelerating) return reject("momentum_not_decelerating", metrics, dataQuality);

  const confidenceScore = confidenceFrom({
    z: Math.max(Math.abs(priceZ.z ?? 0), Math.abs(retZ.z ?? 0)),
    entryAsk,
    decelerating,
    distanceSigma: distance.distanceSigma,
    zVolume: volume.zVolume,
    dataQuality
  });

  return {
    shouldEnter: true,
    sideToBuy: reversal,
    entryAsk,
    reason: "exhaustion_reversal_candidate",
    metrics,
    confidenceScore,
    dataQuality
  };
}

function reject(reason: string, metrics: ExhaustionSignal["metrics"], dataQuality: DataQuality): ExhaustionSignal {
  return { shouldEnter: false, reason, metrics, confidenceScore: 0, dataQuality };
}

function spreadOf(bid?: number, ask?: number): number | undefined {
  return bid !== undefined && ask !== undefined ? ask - bid : undefined;
}

function qualityOf(points: BtcPricePoint[], odds?: PolymarketOddsSnapshot): DataQuality {
  const hasChainlink = points.some((point) => point.source === "chainlink");
  if (hasChainlink && odds?.source === "book") return "CHAINLINK_ALIGNED";
  if (odds?.source === "proxy") return "ODDS_PROXY";
  if (!odds) return "LOW_CONFIDENCE";
  return "EXCHANGE_PROXY";
}

function confidenceFrom(input: {
  z: number;
  entryAsk: number;
  decelerating: boolean;
  distanceSigma?: number;
  zVolume?: number;
  dataQuality: DataQuality;
}): number {
  const qualityPenalty = input.dataQuality === "CHAINLINK_ALIGNED" ? 0 : input.dataQuality === "EXCHANGE_PROXY" ? 8 : 18;
  const distancePenalty = input.distanceSigma === undefined ? 8 : Math.max(0, input.distanceSigma - 2) * 4;
  const score =
    35 +
    Math.min(25, input.z * 7) +
    Math.min(15, (0.25 - input.entryAsk) * 80) +
    (input.decelerating ? 12 : 0) +
    Math.min(8, Math.max(0, input.zVolume ?? 0) * 3) -
    distancePenalty -
    qualityPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}
