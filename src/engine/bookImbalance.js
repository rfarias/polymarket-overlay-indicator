const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function computeBookImbalance(orderbook) {
  if (!orderbook?.bids?.length || !orderbook?.asks?.length) {
    return {
      bidLiquidity: 0,
      askLiquidity: 0,
      spread: Number.POSITIVE_INFINITY,
      thinBook: true,
      emptyLevels: 0,
      moveCostTicks: 0,
      score: 0
    };
  }

  const topBids = orderbook.bids.slice(0, 6);
  const topAsks = orderbook.asks.slice(0, 6);

  const bidLiquidity = topBids.reduce((acc, level) => acc + level.size, 0);
  const askLiquidity = topAsks.reduce((acc, level) => acc + level.size, 0);
  const mid = ((topAsks[0]?.price ?? 0) + (topBids[0]?.price ?? 0)) / 2;
  const spread = (topAsks[0]?.price ?? 1) - (topBids[0]?.price ?? 0);

  const imbalance = (bidLiquidity - askLiquidity) / Math.max(bidLiquidity + askLiquidity, 1);
  const emptyLevels = [...topBids, ...topAsks].filter((l) => l.size <= 0.1).length;
  const thinBook = (bidLiquidity + askLiquidity) < 50;

  const tickSize = mid > 0.8 ? 0.01 : 0.005;
  const moveCostTicks = Math.round(spread / Math.max(tickSize, 0.001));

  let raw = imbalance * 100;
  if (thinBook) raw *= 0.5;
  if (emptyLevels >= 3) raw *= 0.7;

  return {
    bidLiquidity,
    askLiquidity,
    spread,
    thinBook,
    emptyLevels,
    moveCostTicks,
    score: clamp(raw, -100, 100)
  };
}
