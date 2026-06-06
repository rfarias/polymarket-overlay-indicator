import { ExhaustionParameters } from "./types.js";

export function defaultExhaustionParameterGrid(): ExhaustionParameters[] {
  const zThresholds = [2, 2.25, 2.5, 2.75, 3, 3.25];
  const maxEntryPrices = [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25];
  const bands = [
    { min: 120, max: 180 },
    { min: 90, max: 120 },
    { min: 60, max: 90 },
    { min: 30, max: 60 },
    { min: 10, max: 30 }
  ];
  const grid: ExhaustionParameters[] = [];
  for (const zThreshold of zThresholds) {
    for (const maxEntryPrice of maxEntryPrices) {
      for (const secondsRemaining of bands) {
        grid.push({
          name: `z${zThreshold}_ask${maxEntryPrice}_sec${secondsRemaining.min}-${secondsRemaining.max}`,
          zThreshold,
          priceWindowSec: 60,
          returnWindowSec: 30,
          maxEntryPrice,
          secondsRemaining,
          maxDistanceSigma: 3,
          requireDeceleration: false,
          latencyMs: 500,
          slippagePrice: 0.005
        });
      }
    }
  }
  return grid;
}

export function namedExhaustionSetups(): ExhaustionParameters[] {
  return [
    {
      name: "setup1_z_simple",
      zThreshold: 3,
      priceWindowSec: 60,
      returnWindowSec: 30,
      maxEntryPrice: 0.2,
      secondsRemaining: { min: 30, max: 120 },
      requireDeceleration: false,
      latencyMs: 500,
      slippagePrice: 0.005
    },
    {
      name: "setup2_z_distance",
      zThreshold: 3,
      priceWindowSec: 60,
      returnWindowSec: 30,
      maxEntryPrice: 0.2,
      secondsRemaining: { min: 30, max: 120 },
      maxDistanceSigma: 3,
      latencyMs: 500,
      slippagePrice: 0.005,
      requireDeceleration: false
    },
    {
      name: "setup3_z_volume_climax",
      zThreshold: 2.5,
      priceWindowSec: 60,
      returnWindowSec: 30,
      maxEntryPrice: 0.2,
      secondsRemaining: { min: 30, max: 120 },
      minVolumeZ: 2,
      minAggressionRatio: 0.7,
      latencyMs: 500,
      slippagePrice: 0.005,
      requireDeceleration: false
    },
    {
      name: "setup4_z_deceleration",
      zThreshold: 2.5,
      priceWindowSec: 60,
      returnWindowSec: 30,
      maxEntryPrice: 0.2,
      secondsRemaining: { min: 30, max: 120 },
      requireDeceleration: true,
      latencyMs: 500,
      slippagePrice: 0.005
    },
    {
      name: "setup5_complete",
      zThreshold: 2.5,
      priceWindowSec: 60,
      returnWindowSec: 30,
      maxEntryPrice: 0.15,
      secondsRemaining: { min: 30, max: 120 },
      maxDistanceSigma: 3,
      minVolumeZ: 2,
      minAggressionRatio: 0.7,
      requireDeceleration: true,
      maxSpread: 0.03,
      latencyMs: 500,
      slippagePrice: 0.005
    }
  ];
}
