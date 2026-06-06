import { lastAtOrBefore } from "../exhaustionReversal/indicators.js";
import {
  BtcPricePoint,
  DataQuality,
  ExhaustionBacktestDataset,
  Outcome,
  PolymarketOddsSnapshot,
  UpDownMarketWindow
} from "../exhaustionReversal/types.js";
import {
  OddsCalibrationBucket,
  OddsCalibrationObservation,
  OddsCalibrationOptions,
  OddsCalibrationReport
} from "./types.js";

const ODD_BANDS = [
  [0.01, 0.05],
  [0.05, 0.08],
  [0.08, 0.10],
  [0.10, 0.15],
  [0.15, 0.20],
  [0.20, 0.30],
  [0.30, 0.40],
  [0.40, 0.50],
  [0.50, 0.60],
  [0.60, 0.70],
  [0.70, 0.80],
  [0.80, 0.90],
  [0.90, 0.95],
  [0.95, 0.99]
] as const;

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

export function defaultOddsCalibrationOptions(): OddsCalibrationOptions {
  return {
    slippagePrice: 0.01,
    minSamples: 30,
    distanceVolWindowSec: 60
  };
}

export function runOddsCalibration(
  dataset: ExhaustionBacktestDataset,
  options: Partial<OddsCalibrationOptions> = {}
): OddsCalibrationReport {
  const config = { ...defaultOddsCalibrationOptions(), ...options };
  const markets = new Map(dataset.markets.map((market) => [market.marketId, market]));
  const btcPrices = [...dataset.btcPrices].sort((a, b) => a.timeMs - b.timeMs);
  const observations = [...dataset.odds]
    .sort((a, b) => a.timeMs - b.timeMs)
    .flatMap((odds) => observationsFromOdds(odds, markets.get(odds.marketId), btcPrices, config));

  const buckets = [
    ...bucketize("side", observations, (row) => row.side, config),
    ...bucketize("odd", observations, (row) => row.oddBand, config),
    ...bucketize("seconds", observations, (row) => row.secondsBand, config),
    ...bucketize("distance_sigma", observations, (row) => row.distanceSigmaBand, config),
    ...bucketize("side_odd", observations, (row) => `${row.side}|${row.oddBand}`, config),
    ...bucketize("side_seconds", observations, (row) => `${row.side}|${row.secondsBand}`, config),
    ...bucketize("odd_seconds", observations, (row) => `${row.oddBand}|${row.secondsBand}`, config),
    ...bucketize("side_odd_seconds", observations, (row) => `${row.side}|${row.oddBand}|${row.secondsBand}`, config),
    ...bucketize(
      "side_odd_seconds_distance",
      observations,
      (row) => `${row.side}|${row.oddBand}|${row.secondsBand}|${row.distanceSigmaBand}`,
      config
    )
  ];

  const meaningful = buckets.filter((bucket) => bucket.samples >= config.minSamples);
  return {
    generatedAt: new Date().toISOString(),
    options: config,
    sourceNotes: [
      "Uses historical ask price as entry price for each side when available.",
      "Net edge subtracts slippagePrice from the entry price.",
      "Final result uses market.result from the dataset. Buckets below minSamples are marked LOW_SAMPLE.",
      "BTC price is used only for distance buckets and is an exchange/proxy input unless the dataset source says otherwise."
    ],
    observations: observations.length,
    markets: new Set(observations.map((row) => row.marketId)).size,
    buckets,
    bestBuckets: [...meaningful].sort((a, b) => b.netEdge - a.netEdge).slice(0, 30),
    worstBuckets: [...meaningful].sort((a, b) => a.netEdge - b.netEdge).slice(0, 30)
  };
}

function observationsFromOdds(
  odds: PolymarketOddsSnapshot,
  market: UpDownMarketWindow | undefined,
  btcPrices: BtcPricePoint[],
  options: OddsCalibrationOptions
): OddsCalibrationObservation[] {
  if (!market?.result) return [];
  if (odds.timeMs < market.startTimeMs || odds.timeMs > market.endTimeMs) return [];

  const secondsRemaining = (market.endTimeMs - odds.timeMs) / 1000;
  const secondsBand = bandLabel(secondsRemaining, SECONDS_BANDS, "outside");
  if (secondsBand === "outside") return [];

  const pricePoint = lastAtOrBefore(btcPrices, odds.timeMs);
  const rollingStd = rollingStdPriceAt(btcPrices, odds.timeMs, options.distanceVolWindowSec * 1000);
  const hasValidBeat = Number.isFinite(market.priceToBeat) && market.priceToBeat > 0;
  const distanceUsd = pricePoint && hasValidBeat ? Math.abs(pricePoint.price - market.priceToBeat) : undefined;
  const distanceBps = pricePoint && distanceUsd !== undefined && pricePoint.price > 0 ? (distanceUsd / pricePoint.price) * 10_000 : undefined;
  const distanceSigma = rollingStd && rollingStd > 0 && distanceUsd !== undefined ? distanceUsd / rollingStd : undefined;
  const base = {
    marketId: market.marketId,
    slug: market.slug,
    timeMs: odds.timeMs,
    secondsRemaining,
    priceNow: pricePoint?.price,
    priceToBeat: hasValidBeat ? market.priceToBeat : undefined,
    distanceBps,
    distanceSigma,
    secondsBand,
    distanceSigmaBand: distanceSigma === undefined ? "unknown" : bandLabel(distanceSigma, DISTANCE_SIGMA_BANDS, ">=5"),
    sourceQuality: qualityFromOdds(odds)
  };

  return [
    odds.upAsk === undefined ? undefined : sideObservation(base, "UP", odds.upAsk, market.result),
    odds.downAsk === undefined ? undefined : sideObservation(base, "DOWN", odds.downAsk, market.result)
  ].filter((row): row is OddsCalibrationObservation => row !== undefined);
}

function sideObservation(
  base: Omit<OddsCalibrationObservation, "side" | "ask" | "win" | "oddBand">,
  side: Outcome,
  ask: number,
  finalResult: Outcome
): OddsCalibrationObservation | undefined {
  if (!Number.isFinite(ask) || ask <= 0 || ask >= 1) return undefined;
  return {
    ...base,
    side,
    ask,
    win: side === finalResult,
    oddBand: bandLabel(ask, ODD_BANDS, "outside")
  };
}

function bucketize(
  bucketType: string,
  observations: OddsCalibrationObservation[],
  keyFn: (row: OddsCalibrationObservation) => string,
  options: OddsCalibrationOptions
): OddsCalibrationBucket[] {
  const groups = new Map<string, OddsCalibrationObservation[]>();
  for (const row of observations) {
    const key = keyFn(row);
    if (key.includes("outside")) continue;
    const rows = groups.get(key) ?? [];
    rows.push(row);
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([bucketKey, rows]) => summarizeBucket(bucketType, bucketKey, rows, options));
}

function summarizeBucket(
  bucketType: string,
  bucketKey: string,
  rows: OddsCalibrationObservation[],
  options: OddsCalibrationOptions
): OddsCalibrationBucket {
  const wins = rows.filter((row) => row.win).length;
  const avgOdd = average(rows.map((row) => row.ask));
  const avgNetEntry = average(rows.map((row) => Math.min(0.99, row.ask + options.slippagePrice)));
  const winRate = rows.length ? wins / rows.length : 0;
  return {
    bucketType,
    bucketKey,
    samples: rows.length,
    wins,
    winRate,
    avgOdd,
    avgNetEntry,
    grossEdge: winRate - avgOdd,
    netEdge: winRate - avgNetEntry,
    calibrationError: Math.abs(winRate - avgOdd),
    brierScore: average(rows.map((row) => ((row.win ? 1 : 0) - row.ask) ** 2)),
    avgSecondsRemaining: average(rows.map((row) => row.secondsRemaining)),
    avgDistanceBps: averageOptional(rows.map((row) => row.distanceBps)),
    avgDistanceSigma: averageOptional(rows.map((row) => row.distanceSigma)),
    dataQuality: combinedQuality(rows.map((row) => row.sourceQuality)),
    sampleQuality: rows.length >= options.minSamples ? "OK" : "LOW_SAMPLE"
  };
}

function rollingStdPriceAt(points: BtcPricePoint[], timeMs: number, windowMs: number): number | undefined {
  const prices: number[] = [];
  for (let index = points.length - 1; index >= 0; index--) {
    const point = points[index];
    if (!point) continue;
    if (point.timeMs > timeMs) continue;
    if (point.timeMs < timeMs - windowMs) break;
    prices.push(point.price);
  }
  if (prices.length < 2) return undefined;
  const mean = average(prices);
  return Math.sqrt(average(prices.map((price) => (price - mean) ** 2)));
}

function bandLabel(value: number, bands: readonly (readonly [number, number])[], fallback: string): string {
  const band = bands.find(([min, max]) => value >= min && value < max);
  if (!band) return fallback;
  const [min, max] = band;
  return max === Number.POSITIVE_INFINITY ? `>=${formatBandValue(min)}` : `${formatBandValue(min)}-${formatBandValue(max)}`;
}

function formatBandValue(value: number): string {
  return value < 1 ? value.toFixed(2) : String(value);
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
