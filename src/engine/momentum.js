const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function computeMomentum(prices = []) {
  if (prices.length < 2) {
    return {
      delta2s: 0,
      delta5s: 0,
      delta10s: 0,
      acceleration: 0,
      range10sPct: 0,
      range15sPct: 0,
      volatilityPct: 0,
      score: 0
    };
  }

  const now = Date.now();
  const latest = prices[prices.length - 1]?.price ?? 0;

  const valueAt = (ms) => {
    const target = now - ms;
    const point = [...prices].reverse().find((entry) => entry.ts <= target);
    return point?.price ?? prices[0]?.price ?? latest;
  };

  const ref2 = valueAt(2000);
  const ref5 = valueAt(5000);
  const ref10 = valueAt(10000);

  const pct = (base) => (base ? ((latest - base) / base) * 100 : 0);

  const delta2s = pct(ref2);
  const delta5s = pct(ref5);
  const delta10s = pct(ref10);
  const acceleration = delta2s - delta5s;

  const window10s = prices.filter((entry) => entry.ts >= now - 10_000);
  const window15s = prices.filter((entry) => entry.ts >= now - 15_000);
  const latestSafe = latest || 1;
  const high10s = window10s.reduce((acc, entry) => Math.max(acc, entry.price || 0), 0);
  const low10s = window10s.reduce((acc, entry) => Math.min(acc, entry.price || Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  const high15s = window15s.reduce((acc, entry) => Math.max(acc, entry.price || 0), 0);
  const low15s = window15s.reduce((acc, entry) => Math.min(acc, entry.price || Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  const range10sPct = Number.isFinite(low10s) ? ((high10s - low10s) / latestSafe) * 100 : 0;
  const range15sPct = Number.isFinite(low15s) ? ((high15s - low15s) / latestSafe) * 100 : 0;
  const volatilityPct = (range10sPct * 0.65) + (range15sPct * 0.35);

  const weighted = (delta2s * 0.45) + (delta5s * 0.35) + (delta10s * 0.2) + (acceleration * 0.25);
  const score = clamp(weighted * 35, -100, 100);

  return { delta2s, delta5s, delta10s, acceleration, range10sPct, range15sPct, volatilityPct, score };
}
