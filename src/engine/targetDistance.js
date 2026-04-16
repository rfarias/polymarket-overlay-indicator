const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function computeTargetDistance({ btcPrice, targetPrice }) {
  if (!btcPrice || !targetPrice) {
    return {
      distanceAbs: 0,
      distancePct: 0,
      proximityBand: 'unknown',
      score: 0
    };
  }

  const distanceAbs = btcPrice - targetPrice;
  const distancePct = (distanceAbs / targetPrice) * 100;
  const near = Math.abs(distancePct) < 0.05;
  const medium = Math.abs(distancePct) < 0.15;

  const proximityBand = near ? 'short' : medium ? 'medium' : 'far';
  const score = clamp((distancePct * -600), -100, 100);

  return { distanceAbs, distancePct, proximityBand, score };
}
