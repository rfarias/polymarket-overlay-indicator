import { BtcPricePoint, DistanceMetrics, Outcome } from "./types.js";

export function rollingMean(values: number[]): number | undefined {
  const clean = finite(values);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : undefined;
}

export function rollingStd(values: number[]): number | undefined {
  const clean = finite(values);
  if (clean.length < 2) return undefined;
  const mean = rollingMean(clean);
  if (mean === undefined) return undefined;
  return Math.sqrt(clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length);
}

export function zScorePrice(points: BtcPricePoint[], priceNow: number): { z?: number; mean?: number; std?: number } {
  const mean = rollingMean(points.map((point) => point.price));
  const std = rollingStd(points.map((point) => point.price));
  return { z: std && std > 0 && mean !== undefined ? (priceNow - mean) / std : undefined, mean, std };
}

export function zScoreReturn(points: BtcPricePoint[], nowMs: number, returnWindowMs: number): { z?: number; std?: number; ret?: number } {
  const current = lastAtOrBefore(points, nowMs);
  const reference = lastAtOrBefore(points, nowMs - returnWindowMs);
  if (!current || !reference || reference.price <= 0) return {};
  const ret = current.price / reference.price - 1;
  const returns: number[] = [];
  for (const point of points) {
    if (point.timeMs > nowMs) break;
    const prior = lastAtOrBefore(points, point.timeMs - returnWindowMs);
    if (prior && prior.price > 0) returns.push(point.price / prior.price - 1);
  }
  const std = rollingStd(returns);
  return { z: std && std > 0 ? ret / std : undefined, std, ret };
}

export function volumeAggression(points: BtcPricePoint[]): {
  volume?: number;
  buyVolume?: number;
  sellVolume?: number;
  aggressionRatio?: number;
  zVolume?: number;
} {
  const volume = sumDefined(points.map((point) => point.volume));
  const buyVolume = sumDefined(points.map((point) => point.buyVolume)) ?? 0;
  const sellVolume = sumDefined(points.map((point) => point.sellVolume)) ?? 0;
  const totalAggressive = buyVolume + sellVolume;
  const zVolume = zOfLast(points.map((point) => point.volume));
  return {
    volume,
    buyVolume,
    sellVolume,
    aggressionRatio: totalAggressive > 0 ? Math.max(buyVolume, sellVolume) / totalAggressive : undefined,
    zVolume
  };
}

export function momentumVelocity(points: BtcPricePoint[], nowMs: number, windowMs: number): number | undefined {
  const current = lastAtOrBefore(points, nowMs);
  const reference = lastAtOrBefore(points, nowMs - windowMs);
  if (!current || !reference) return undefined;
  return (current.price - reference.price) / (windowMs / 1000);
}

export function momentumDeceleration(points: BtcPricePoint[], nowMs: number, direction: Outcome): boolean {
  const velocity5 = momentumVelocity(points, nowMs, 5_000);
  const velocity20 = momentumVelocity(points, nowMs - 5_000, 15_000);
  if (velocity5 === undefined || velocity20 === undefined) return false;
  if (direction === "UP") return velocity20 > 0 && velocity5 >= 0 && velocity5 < velocity20;
  return velocity20 < 0 && velocity5 <= 0 && Math.abs(velocity5) < Math.abs(velocity20);
}

export function distanceToBeat(priceNow: number, priceToBeat: number, rollingStdPrice: number | undefined): DistanceMetrics {
  const distanceUsd = Math.abs(priceNow - priceToBeat);
  return {
    distanceUsd,
    distanceBps: priceNow > 0 ? (distanceUsd / priceNow) * 10_000 : 0,
    distanceSigma: rollingStdPrice && rollingStdPrice > 0 ? distanceUsd / rollingStdPrice : undefined,
    requiredVelocity: distanceUsd
  };
}

export function requiredVelocity(distanceUsd: number, secondsRemaining: number): number {
  return secondsRemaining > 0 ? distanceUsd / secondsRemaining : Number.POSITIVE_INFINITY;
}

export function sideFromBeat(priceNow: number, priceToBeat: number): { dominant: Outcome; reversal: Outcome } {
  const dominant: Outcome = priceNow >= priceToBeat ? "UP" : "DOWN";
  return { dominant, reversal: dominant === "UP" ? "DOWN" : "UP" };
}

export function lastAtOrBefore(points: BtcPricePoint[], timeMs: number): BtcPricePoint | undefined {
  for (let index = points.length - 1; index >= 0; index--) {
    if ((points[index]?.timeMs ?? 0) <= timeMs) return points[index];
  }
  return undefined;
}

export function pointsBetween(points: BtcPricePoint[], startMs: number, endMs: number): BtcPricePoint[] {
  return points.filter((point) => point.timeMs >= startMs && point.timeMs <= endMs);
}

function finite(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const clean = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) : undefined;
}

function zOfLast(values: Array<number | undefined>): number | undefined {
  const clean = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (clean.length < 3) return undefined;
  const last = clean[clean.length - 1];
  const history = clean.slice(0, -1);
  const mean = rollingMean(history);
  const std = rollingStd(history);
  return mean !== undefined && std && std > 0 ? (last - mean) / std : undefined;
}
