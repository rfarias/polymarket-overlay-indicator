import {
  BtcPricePoint,
  DataQuality,
  ExhaustionBacktestDataset,
  Outcome,
  PolymarketOddsSnapshot,
  UpDownMarketWindow
} from "../exhaustionReversal/types.js";
import {
  DistanceToBeatBucket,
  DistanceToBeatObservation,
  DistanceToBeatOptions,
  DistanceToBeatReport
} from "./types.js";

const SECONDS_BANDS = [
  [180, 240],
  [120, 180],
  [90, 120],
  [60, 90],
  [30, 60],
  [15, 30],
  [5, 15]
] as const;

const DISTANCE_SIGMA_BANDS = [
  [0, 0.5],
  [0.5, 1],
  [1, 2],
  [2, 3],
  [3, 5],
  [5, Number.POSITIVE_INFINITY]
] as const;

const SIGNED_DISTANCE_BPS_BANDS = [
  [-Number.POSITIVE_INFINITY, -50],
  [-50, -30],
  [-30, -15],
  [-15, -5],
  [-5, 0],
  [0, 5],
  [5, 15],
  [15, 30],
  [30, 50],
  [50, Number.POSITIVE_INFINITY]
] as const;

export function defaultDistanceToBeatOptions(): DistanceToBeatOptions {
  return {
    minSamples: 30,
    volatilityWindowSec: 60,
    slippagePrice: 0.01
  };
}

export function runDistanceToBeatStudy(
  dataset: ExhaustionBacktestDataset,
  options: Partial<DistanceToBeatOptions> = {}
): DistanceToBeatReport {
  const config = { ...defaultDistanceToBeatOptions(), ...options };
  const markets = new Map(dataset.markets.map((market) => [market.marketId, market]));
  const btcPrices = [...dataset.btcPrices].sort((a, b) => a.timeMs - b.timeMs);
  const btcIndex = new BtcSeriesIndex(btcPrices);
  const observations = [...dataset.odds]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((odds) => observationFromOdds(odds, markets.get(odds.marketId), btcIndex, config))
    .filter((row): row is DistanceToBeatObservation => row !== undefined);

  const buckets = [
    ...bucketize("seconds", observations, (row) => row.secondsBand, config),
    ...bucketize("distance_sigma", observations, (row) => row.distanceSigmaBand, config),
    ...bucketize("signed_distance_bps", observations, (row) => row.signedDistanceBpsBand, config),
    ...bucketize("seconds_distance_sigma", observations, (row) => `${row.secondsBand}|${row.distanceSigmaBand}`, config),
    ...bucketize("seconds_signed_distance_bps", observations, (row) => `${row.secondsBand}|${row.signedDistanceBpsBand}`, config),
    ...bucketize("dominant_seconds_distance_sigma", observations, (row) => `${row.dominantSide}|${row.secondsBand}|${row.distanceSigmaBand}`, config)
  ];

  const meaningful = buckets.filter((bucket) => bucket.samples >= config.minSamples);
  return {
    generatedAt: new Date().toISOString(),
    options: config,
    sourceNotes: [
      "Measures empirical resolution probability by distance to Price to Beat and time remaining.",
      "Distance is calculated from the latest BTC proxy sample at or before the odds timestamp.",
      "Net edge fields compare empirical probability with observed ask plus slippagePrice when ask is available.",
      "This is a research matrix, not a trade signal by itself."
    ],
    observations: observations.length,
    markets: new Set(observations.map((row) => row.marketId)).size,
    buckets,
    bestReversalBuckets: [...meaningful]
      .filter((bucket) => bucket.reversalNetEdge !== undefined)
      .sort((a, b) => (b.reversalNetEdge ?? -Infinity) - (a.reversalNetEdge ?? -Infinity))
      .slice(0, 30),
    bestDominantBuckets: [...meaningful]
      .filter((bucket) => bucket.dominantNetEdge !== undefined)
      .sort((a, b) => (b.dominantNetEdge ?? -Infinity) - (a.dominantNetEdge ?? -Infinity))
      .slice(0, 30)
  };
}

function observationFromOdds(
  odds: PolymarketOddsSnapshot,
  market: UpDownMarketWindow | undefined,
  btcIndex: BtcSeriesIndex,
  options: DistanceToBeatOptions
): DistanceToBeatObservation | undefined {
  if (!market?.result) return undefined;
  if (!Number.isFinite(market.priceToBeat) || market.priceToBeat <= 0) return undefined;
  if (odds.timeMs < market.startTimeMs || odds.timeMs > market.endTimeMs) return undefined;
  const secondsRemaining = (market.endTimeMs - odds.timeMs) / 1000;
  const secondsBand = bandLabel(secondsRemaining, SECONDS_BANDS, "outside");
  if (secondsBand === "outside") return undefined;

  const pricePoint = btcIndex.lastAtOrBefore(odds.timeMs);
  if (!pricePoint) return undefined;

  const signedDistanceUsd = pricePoint.price - market.priceToBeat;
  const distanceUsd = Math.abs(signedDistanceUsd);
  const signedDistanceBps = pricePoint.price > 0 ? (signedDistanceUsd / pricePoint.price) * 10_000 : 0;
  const distanceBps = Math.abs(signedDistanceBps);
  const rollingStd = btcIndex.rollingStdAt(odds.timeMs, options.volatilityWindowSec * 1000);
  const distanceSigma = rollingStd && rollingStd > 0 ? distanceUsd / rollingStd : undefined;
  const dominantSide: Outcome = pricePoint.price >= market.priceToBeat ? "UP" : "DOWN";

  return {
    marketId: market.marketId,
    slug: market.slug,
    timeMs: odds.timeMs,
    result: market.result,
    priceNow: pricePoint.price,
    priceToBeat: market.priceToBeat,
    secondsRemaining,
    dominantSide,
    distanceUsd,
    distanceBps,
    distanceSigma,
    requiredVelocity: secondsRemaining > 0 ? distanceUsd / secondsRemaining : Number.POSITIVE_INFINITY,
    secondsBand,
    distanceSigmaBand: distanceSigma === undefined ? "unknown" : bandLabel(distanceSigma, DISTANCE_SIGMA_BANDS, ">=5"),
    signedDistanceBpsBand: signedBandLabel(signedDistanceBps),
    upAsk: odds.upAsk,
    downAsk: odds.downAsk,
    sourceQuality: qualityFromOdds(odds)
  };
}

function bucketize(
  bucketType: string,
  observations: DistanceToBeatObservation[],
  keyFn: (row: DistanceToBeatObservation) => string,
  options: DistanceToBeatOptions
): DistanceToBeatBucket[] {
  const groups = new Map<string, DistanceToBeatObservation[]>();
  for (const row of observations) {
    const key = keyFn(row);
    if (key.includes("outside") || key.includes("unknown")) continue;
    const rows = groups.get(key) ?? [];
    rows.push(row);
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([bucketKey, rows]) => summarizeBucket(bucketType, bucketKey, rows, options));
}

function summarizeBucket(
  bucketType: string,
  bucketKey: string,
  rows: DistanceToBeatObservation[],
  options: DistanceToBeatOptions
): DistanceToBeatBucket {
  const upWins = rows.filter((row) => row.result === "UP").length;
  const downWins = rows.length - upWins;
  const dominantWins = rows.filter((row) => row.result === row.dominantSide).length;
  const reversalWins = rows.length - dominantWins;
  const upWinRate = rows.length ? upWins / rows.length : 0;
  const downWinRate = rows.length ? downWins / rows.length : 0;
  const dominantWinRate = rows.length ? dominantWins / rows.length : 0;
  const reversalWinRate = rows.length ? reversalWins / rows.length : 0;
  const avgUpAsk = averageOptional(rows.map((row) => row.upAsk));
  const avgDownAsk = averageOptional(rows.map((row) => row.downAsk));
  const dominantAsks = rows.map((row) => row.dominantSide === "UP" ? row.upAsk : row.downAsk);
  const reversalAsks = rows.map((row) => row.dominantSide === "UP" ? row.downAsk : row.upAsk);
  const avgDominantAsk = averageOptional(dominantAsks);
  const avgReversalAsk = averageOptional(reversalAsks);

  return {
    bucketType,
    bucketKey,
    samples: rows.length,
    upWins,
    downWins,
    upWinRate,
    downWinRate,
    dominantWinRate,
    reversalWinRate,
    avgUpAsk,
    avgDownAsk,
    avgDominantAsk,
    avgReversalAsk,
    upNetEdge: avgUpAsk === undefined ? undefined : upWinRate - Math.min(0.99, avgUpAsk + options.slippagePrice),
    downNetEdge: avgDownAsk === undefined ? undefined : downWinRate - Math.min(0.99, avgDownAsk + options.slippagePrice),
    dominantNetEdge: avgDominantAsk === undefined ? undefined : dominantWinRate - Math.min(0.99, avgDominantAsk + options.slippagePrice),
    reversalNetEdge: avgReversalAsk === undefined ? undefined : reversalWinRate - Math.min(0.99, avgReversalAsk + options.slippagePrice),
    avgSecondsRemaining: average(rows.map((row) => row.secondsRemaining)),
    avgDistanceUsd: average(rows.map((row) => row.distanceUsd)),
    avgDistanceBps: average(rows.map((row) => row.distanceBps)),
    avgDistanceSigma: averageOptional(rows.map((row) => row.distanceSigma)),
    avgRequiredVelocity: average(rows.map((row) => row.requiredVelocity)),
    dataQuality: combinedQuality(rows.map((row) => row.sourceQuality)),
    sampleQuality: rows.length >= options.minSamples ? "OK" : "LOW_SAMPLE"
  };
}

function bandLabel(value: number, bands: readonly (readonly [number, number])[], fallback: string): string {
  const band = bands.find(([min, max]) => value >= min && value < max);
  if (!band) return fallback;
  const [min, max] = band;
  return max === Number.POSITIVE_INFINITY ? `>=${formatBandValue(min)}` : `${formatBandValue(min)}-${formatBandValue(max)}`;
}

function signedBandLabel(value: number): string {
  const band = SIGNED_DISTANCE_BPS_BANDS.find(([min, max]) => value >= min && value < max);
  if (!band) return "outside";
  const [min, max] = band;
  if (min === -Number.POSITIVE_INFINITY) return `<${formatBandValue(max)}`;
  if (max === Number.POSITIVE_INFINITY) return `>=${formatBandValue(min)}`;
  return `${formatBandValue(min)}-${formatBandValue(max)}`;
}

function formatBandValue(value: number): string {
  return value < 1 && value > -1 ? value.toFixed(2) : String(value);
}

function average(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function averageOptional(values: Array<number | undefined>): number | undefined {
  const clean = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  return clean.length ? average(clean) : undefined;
}

function qualityFromOdds(odds: PolymarketOddsSnapshot): DataQuality {
  if (odds.source === "book") return "EXCHANGE_PROXY";
  if (odds.source === "prices-history" || odds.source === "trade") return "ODDS_PROXY";
  return "LOW_CONFIDENCE";
}

function combinedQuality(values: DataQuality[]): DataQuality {
  if (values.includes("LOW_CONFIDENCE")) return "LOW_CONFIDENCE";
  if (values.includes("ODDS_PROXY")) return "ODDS_PROXY";
  if (values.includes("EXCHANGE_PROXY")) return "EXCHANGE_PROXY";
  return "CHAINLINK_ALIGNED";
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
    const sum = (this.prefixSum[endExclusive] ?? 0) - (this.prefixSum[startInclusive] ?? 0);
    const sqSum = (this.prefixSqSum[endExclusive] ?? 0) - (this.prefixSqSum[startInclusive] ?? 0);
    const mean = sum / count;
    const variance = Math.max(0, sqSum / count - mean ** 2);
    return Math.sqrt(variance);
  }
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
