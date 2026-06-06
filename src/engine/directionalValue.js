const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function inferTimeframeMinutes(meta = {}) {
  const haystack = `${meta?.title || ''} ${meta?.slug || ''}`.toLowerCase();

  if (/\b5\s*(m|min|minute)/.test(haystack)) return 5;
  if (/\b15\s*(m|min|minute)/.test(haystack)) return 15;
  if (/\b1\s*(h|hr|hour)/.test(haystack)) return 60;
  return null;
}

function bpsChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !from) return 0;
  return ((to - from) / from) * 10000;
}

function valueAt(history, msAgo) {
  const now = history[history.length - 1]?.ts ?? Date.now();
  const targetTs = now - msAgo;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].ts <= targetTs) return history[i].price;
  }

  return history[0]?.price ?? null;
}

function recentReturns(history, maxMinutes = 30) {
  const points = [];

  for (let minute = maxMinutes; minute >= 1; minute -= 1) {
    const end = valueAt(history, (minute - 1) * 60_000);
    const start = valueAt(history, minute * 60_000);
    points.push(bpsChange(start, end));
  }

  return points.filter((value) => Number.isFinite(value));
}

function stddev(values) {
  if (values.length < 2) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function countSignFlips(values) {
  let flips = 0;
  let prev = 0;

  for (const value of values) {
    const current = sign(value);
    if (!current) continue;
    if (prev && current !== prev) flips += 1;
    prev = current;
  }

  return flips;
}

function near50Limit(timeframeMin) {
  if (timeframeMin === 5) return 0.35;
  if (timeframeMin === 15) return 0.4;
  return 0.45;
}

function buildFeatures({ btcHistory, targetPrice, timeRemainingSec, marketMeta }) {
  const current = btcHistory[btcHistory.length - 1];
  const timeframeMin = inferTimeframeMinutes(marketMeta);
  if (!current || !timeframeMin || !Number.isFinite(targetPrice) || targetPrice <= 0) return null;

  const timeframeSec = timeframeMin * 60;
  const elapsedSec = Math.max(0, timeframeSec - timeRemainingSec);
  const remainingMin = Math.max(1 / 60, timeRemainingSec / 60);
  const returns = recentReturns(btcHistory, Math.min(30, Math.max(10, timeframeMin)));
  const realizedVolBps = Math.max(1, stddev(returns));
  const sigmaRemainingBps = Math.max(1, realizedVolBps * Math.sqrt(Math.max(remainingMin, 0.25)));
  const retFromOpenBps = bpsChange(targetPrice, current.price);
  const zToTarget = retFromOpenBps / sigmaRemainingBps;
  const mom1 = bpsChange(valueAt(btcHistory, 60_000), current.price);
  const mom3 = bpsChange(valueAt(btcHistory, 3 * 60_000), current.price);
  const mom5 = bpsChange(valueAt(btcHistory, 5 * 60_000), current.price);
  const mom10 = bpsChange(valueAt(btcHistory, 10 * 60_000), current.price);
  const acceleration = mom1 - (mom5 / 2);
  const recentFlips = countSignFlips(returns.slice(-8));
  const recentPrices = btcHistory.filter((point) => point.ts >= current.ts - Math.min(timeframeMin, 15) * 60_000);
  const sessionHigh = Math.max(...recentPrices.map((point) => point.price));
  const sessionLow = Math.min(...recentPrices.map((point) => point.price));
  const prevPrice = valueAt(btcHistory, 30_000) ?? current.price;

  return {
    timeframeMin,
    elapsedFrac: clamp(elapsedSec / timeframeSec, 0, 1),
    retFromOpenBps,
    zToTarget,
    realizedVolBps,
    mom1,
    mom3,
    mom5,
    mom10,
    acceleration,
    recentFlips,
    sessionExcursionUpBps: bpsChange(targetPrice, sessionHigh),
    sessionExcursionDownBps: Math.abs(bpsChange(targetPrice, sessionLow)),
    crossedUp: current.price > targetPrice && prevPrice <= targetPrice,
    crossedDown: current.price < targetPrice && prevPrice >= targetPrice
  };
}

function evaluateSetups(features) {
  const setups = [];
  const near50 = Math.abs(features.zToTarget) <= near50Limit(features.timeframeMin);

  if (!near50) return { near50, setups };

  const alignedDirection = sign(features.retFromOpenBps);
  const continuationAligned = alignedDirection !== 0
    && alignedDirection === sign(features.mom3)
    && alignedDirection === sign(features.mom10)
    && features.recentFlips <= 2;

  if (
    continuationAligned
    && features.elapsedFrac >= 0.22
    && features.elapsedFrac <= 0.78
    && Math.abs(features.retFromOpenBps) >= Math.max(features.timeframeMin === 5 ? 2.5 : 5, features.realizedVolBps * 0.45)
  ) {
    setups.push({
      name: 'continuation',
      direction: alignedDirection > 0 ? 'UP' : 'DOWN',
      score: clamp(58 + Math.abs(features.mom3) / 3 + Math.abs(features.mom10) / 4, 55, 74),
      context: 'Momentum curto e intermediário alinhados no mesmo lado do alvo.'
    });
  }

  const reclaimUp = features.crossedUp
    && features.sessionExcursionDownBps >= Math.max(6, features.realizedVolBps * 0.75)
    && features.mom3 > Math.max(3, features.realizedVolBps * 0.3)
    && features.acceleration > 0;

  const reclaimDown = features.crossedDown
    && features.sessionExcursionUpBps >= Math.max(6, features.realizedVolBps * 0.75)
    && features.mom3 < -Math.max(3, features.realizedVolBps * 0.3)
    && features.acceleration < 0;

  if ((reclaimUp || reclaimDown) && features.elapsedFrac >= 0.18 && features.elapsedFrac <= 0.88) {
    setups.push({
      name: 'reversal-reclaim',
      direction: reclaimUp ? 'UP' : 'DOWN',
      score: clamp(56 + Math.abs(features.mom3) / 3 + Math.abs(features.acceleration) / 3, 54, 72),
      context: 'Preço retomou o alvo depois de excursão contrária com aceleração favorável.'
    });
  }

  if (
    features.elapsedFrac >= (features.timeframeMin === 5 ? 0.58 : 0.68)
    && features.elapsedFrac <= 0.95
    && sign(features.retFromOpenBps) !== 0
    && sign(features.retFromOpenBps) === sign(features.mom1)
    && sign(features.retFromOpenBps) === sign(features.mom3)
    && sign(features.acceleration) === sign(features.retFromOpenBps)
    && features.recentFlips <= 2
  ) {
    setups.push({
      name: 'late-acceleration',
      direction: sign(features.retFromOpenBps) > 0 ? 'UP' : 'DOWN',
      score: clamp(57 + Math.abs(features.mom1) / 2 + Math.abs(features.acceleration) / 3, 55, 73),
      context: 'Aceleração final alinhada no mesmo lado do alvo.'
    });
  }

  return { near50, setups };
}

export function calculateDirectionalValue({ btcHistory = [], targetPrice, timeRemainingSec, marketMeta = {} }) {
  if (!btcHistory.length) {
    return {
      edgeState: 'insufficient-data',
      upValue: 50,
      downValue: 50,
      confidence: 0,
      activeSetup: 'none',
      context: 'Sem histórico suficiente do BTC.',
      timeframeMin: inferTimeframeMinutes(marketMeta),
      near50: false
    };
  }

  const features = buildFeatures({ btcHistory, targetPrice, timeRemainingSec, marketMeta });
  if (!features) {
    return {
      edgeState: 'insufficient-data',
      upValue: 50,
      downValue: 50,
      confidence: 0,
      activeSetup: 'none',
      context: 'Mercado sem timeframe intraday reconhecido ou sem target válido.',
      timeframeMin: inferTimeframeMinutes(marketMeta),
      near50: false
    };
  }

  const { near50, setups } = evaluateSetups(features);
  if (!near50) {
    return {
      edgeState: 'not-near-50',
      upValue: 50,
      downValue: 50,
      confidence: 0,
      activeSetup: 'none',
      context: 'Preço distante demais do alvo para uma entrada próxima de 50c.',
      timeframeMin: features.timeframeMin,
      near50: false,
      diagnostics: features
    };
  }

  if (!setups.length) {
    return {
      edgeState: 'neutral',
      upValue: 50,
      downValue: 50,
      confidence: 0,
      activeSetup: 'none',
      context: 'Próximo de 50c, mas sem edge claro ou com fluxo ruidoso.',
      timeframeMin: features.timeframeMin,
      near50: true,
      diagnostics: features
    };
  }

  const upSetups = setups.filter((setup) => setup.direction === 'UP');
  const downSetups = setups.filter((setup) => setup.direction === 'DOWN');
  const chosen = upSetups.length >= downSetups.length ? upSetups : downSetups;
  const direction = chosen[0].direction;
  const confidence = clamp(
    chosen.reduce((sum, setup) => sum + setup.score, 0) / chosen.length + (chosen.length - 1) * 4,
    55,
    80
  );
  const edgeBias = clamp((confidence - 50) * 1.25, 0, 35);
  const upValue = direction === 'UP' ? clamp(50 + edgeBias, 50, 85) : clamp(50 - edgeBias, 15, 50);
  const downValue = direction === 'DOWN' ? clamp(50 + edgeBias, 50, 85) : clamp(50 - edgeBias, 15, 50);

  return {
    edgeState: direction === 'UP' ? 'value-up' : 'value-down',
    upValue: Math.round(upValue),
    downValue: Math.round(downValue),
    confidence: Math.round(confidence),
    activeSetup: chosen.map((setup) => setup.name).join(' + '),
    context: chosen[0].context,
    timeframeMin: features.timeframeMin,
    near50: true,
    diagnostics: {
      ...features,
      activeSetups: setups
    }
  };
}
