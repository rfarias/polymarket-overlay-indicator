const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function computeTradePressure(trades = []) {
  if (!trades.length) {
    return {
      buyVolume: 0,
      sellVolume: 0,
      buyCount: 0,
      sellCount: 0,
      streak: 0,
      score: 0
    };
  }

  let buyVolume = 0;
  let sellVolume = 0;
  let buyCount = 0;
  let sellCount = 0;
  let streak = 0;

  for (const trade of trades) {
    const isBuy = trade.side === 'buy';
    const qty = trade.size ?? 0;
    if (isBuy) {
      buyVolume += qty;
      buyCount += 1;
      streak = streak >= 0 ? streak + 1 : 1;
    } else {
      sellVolume += qty;
      sellCount += 1;
      streak = streak <= 0 ? streak - 1 : -1;
    }
  }

  const totalVol = Math.max(buyVolume + sellVolume, 1);
  const volBias = (buyVolume - sellVolume) / totalVol;
  const countBias = (buyCount - sellCount) / Math.max(buyCount + sellCount, 1);

  const score = clamp((volBias * 70) + (countBias * 20) + (streak * 2), -100, 100);

  return { buyVolume, sellVolume, buyCount, sellCount, streak, score };
}
