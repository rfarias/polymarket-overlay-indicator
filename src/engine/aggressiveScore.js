import { computeMomentum } from './momentum.js';
import { computeBookImbalance } from './bookImbalance.js';
import { computeTradePressure } from './tradePressure.js';
import { computeReversalRisk } from './reversalRisk.js';
import { computeTargetDistance } from './targetDistance.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function toPercentPoints(odds) {
  return clamp((odds ?? 0) * 100, 1, 99);
}

function computeReferencePrice({ btcPrice, externalPrice }) {
  if (Number.isFinite(externalPrice) && externalPrice > 0) {
    return { value: externalPrice, source: 'Binance/Coinbase' };
  }

  if (Number.isFinite(btcPrice) && btcPrice > 0) {
    return { value: btcPrice, source: 'API local' };
  }

  return { value: null, source: 'Sem feed' };
}

function computeDivergence({ btcPrice, impliedOdds, targetPrice }) {
  if (!btcPrice || !targetPrice || !impliedOdds) {
    return { oddsImplied: 0, btcImplied: 0, diff: 0, score: 0 };
  }

  const btcImplied = toPercentPoints(0.5 + ((btcPrice - targetPrice) / targetPrice) * 50);
  const oddsImplied = toPercentPoints(impliedOdds);
  const diff = btcImplied - oddsImplied;

  return {
    oddsImplied,
    btcImplied,
    diff,
    score: clamp(diff * 3, -100, 100)
  };
}

function computeTimeFactor(timeRemainingSec) {
  if (timeRemainingSec <= 0) return { phase: 'closed', score: -100 };
  if (timeRemainingSec > 150) return { phase: 'early', score: -10 };
  if (timeRemainingSec > 75) return { phase: 'setup', score: 12 };
  if (timeRemainingSec > 20) return { phase: 'decision', score: 25 };
  return { phase: 'final-seconds', score: -25 };
}

function confidence(score) {
  if (score >= 78) return 'Alta';
  if (score >= 58) return 'Média';
  if (score >= 40) return 'Baixa';
  return 'Muito baixa';
}

function classifyRisk(riskScore) {
  if (riskScore >= 65) return 'Alto';
  if (riskScore >= 40) return 'Médio';
  return 'Baixo';
}

function classifyVolatility(momentum) {
  if (momentum.volatilityPct >= 0.55) return 'Alta';
  if (momentum.volatilityPct >= 0.22) return 'Média';
  return 'Baixa';
}

function describeSafety(score) {
  if (score >= 78) return 'Seguro';
  if (score >= 58) return 'Observando';
  return 'Evitar';
}

function describeDirection(score) {
  if (score >= 18) return 'YES';
  if (score <= -18) return 'NO';
  return 'NEUTRO';
}

function directionLabel(direction) {
  if (direction === 'YES') return 'Alta para YES';
  if (direction === 'NO') return 'Pressão para NO';
  return 'Sem direção limpa';
}

function buildEntryPlan({
  direction,
  safetyScore,
  impliedOdds,
  fairOdds,
  orderbook,
  reversalRisk,
  targetDistance,
  timeRemainingSec
}) {
  const marketOdds = toPercentPoints(impliedOdds);
  const gapToFair = fairOdds - marketOdds;
  const safeToEnter =
    safetyScore >= 58 &&
    reversalRisk.riskScore < 65 &&
    Math.abs(gapToFair) >= 1.4 &&
    Math.abs(targetDistance.distancePct) <= 0.18 &&
    timeRemainingSec >= 18;

  if (!safeToEnter || direction === 'NEUTRO') {
    return {
      safeToEnter: false,
      status: 'Aguardar',
      limitDirection: direction === 'NEUTRO' ? 'NEUTRO' : direction,
      limitPrice: null,
      limitPriceBand: null,
      reason:
        reversalRisk.riskScore >= 65 ? 'reversão alta' :
        Math.abs(gapToFair) < 1.4 ? 'delay pequeno' :
        Math.abs(targetDistance.distancePct) > 0.18 ? 'target distante' :
        timeRemainingSec < 18 ? 'janela curta' :
        'sem vantagem limpa'
    };
  }

  const bestBid = orderbook?.bids?.[0]?.price ?? null;
  const bestAsk = orderbook?.asks?.[0]?.price ?? null;
  const edgeDiscount = clamp(Math.abs(gapToFair) * 0.35, 0.6, 2.2);
  const ideal = direction === 'YES'
    ? clamp(fairOdds - edgeDiscount, 1, 99)
    : clamp((100 - fairOdds) - edgeDiscount, 1, 99);
  const bookAnchor = direction === 'YES'
    ? (Number.isFinite(bestBid) ? (bestBid * 100) + 0.5 : ideal)
    : (Number.isFinite(bestAsk) ? (100 - (bestAsk * 100)) + 0.5 : ideal);
  const limitPrice = clamp(Math.min(ideal, bookAnchor), 1, 99);

  return {
    safeToEnter: true,
    status: 'Pode entrar',
    limitDirection: direction,
    limitPrice: Math.round(limitPrice * 10) / 10,
    limitPriceBand: `${Math.max(1, Math.round((limitPrice - 0.8) * 10) / 10)}-${Math.min(99, Math.round((limitPrice + 0.8) * 10) / 10)}`,
    reason: 'delay capturável com book aceitável'
  };
}

export function calculateAggressiveEdge(input) {
  const reference = computeReferencePrice(input);
  const normalizedInput = { ...input, btcPrice: reference.value };
  const divergence = computeDivergence(normalizedInput);
  const momentum = computeMomentum(input.btcHistory);
  const bookImbalance = computeBookImbalance(input.orderbook);
  const tradePressure = computeTradePressure(input.recentTrades);
  const targetDistance = computeTargetDistance(normalizedInput);
  const timeFactor = computeTimeFactor(input.timeRemainingSec);

  const directionBias =
    (divergence.score * 0.45) +
    (momentum.score * 0.25) +
    (bookImbalance.score * 0.15) +
    (tradePressure.score * 0.15);
  const direction = describeDirection(directionBias);

  const reversalRisk = computeReversalRisk({
    momentum,
    tradePressure,
    bookImbalance,
    timeRemainingSec: input.timeRemainingSec,
    gapToFairPctPoints: divergence.diff
  });

  const setupScoreRaw =
    (Math.abs(divergence.diff) * 12) +
    (Math.max(0, 18 - Math.abs(targetDistance.distancePct * 100)) * 1.4) +
    (Math.max(bookImbalance.score, 0) * (direction === 'YES' ? 0.18 : 0.1)) +
    (Math.max(-bookImbalance.score, 0) * (direction === 'NO' ? 0.18 : 0.1)) +
    (Math.abs(momentum.score) * 0.12) +
    Math.max(timeFactor.score, 0);

  let protectionsPenalty = 0;
  if (bookImbalance.spread >= 0.02) protectionsPenalty += 12;
  if (bookImbalance.thinBook) protectionsPenalty += 10;
  protectionsPenalty += reversalRisk.riskScore * 0.32;
  protectionsPenalty += momentum.volatilityPct >= 0.55 ? 18 : momentum.volatilityPct >= 0.22 ? 8 : 0;
  protectionsPenalty += input.timeRemainingSec <= 15 ? 20 : 0;

  const fairOdds = divergence.btcImplied;
  const marketOdds = divergence.oddsImplied;
  const gapToFair = fairOdds - marketOdds;
  const setupScore = clamp(setupScoreRaw - protectionsPenalty, 0, 100);
  const entryPlan = buildEntryPlan({
    direction,
    safetyScore: setupScore,
    impliedOdds: input.impliedOdds,
    fairOdds,
    orderbook: input.orderbook,
    reversalRisk,
    targetDistance,
    timeRemainingSec: input.timeRemainingSec
  });

  return {
    score: Math.round(setupScore),
    direction,
    confidence: confidence(setupScore),
    safety: describeSafety(setupScore),
    directionLabel: directionLabel(direction),
    referencePrice: reference.value,
    referenceSource: reference.source,
    marketOdds,
    fairOdds,
    gapToFair,
    momentumStrength: Math.abs(momentum.score) > 60 ? 'Forte' : Math.abs(momentum.score) > 35 ? 'Moderado' : 'Fraco',
    bookBias: bookImbalance.score > 20 ? 'Favorável' : bookImbalance.score < -20 ? 'Desfavorável' : 'Neutro',
    tradeBias: tradePressure.score > 20 ? 'Compradora' : tradePressure.score < -20 ? 'Vendedora' : 'Mista',
    volatility: classifyVolatility(momentum),
    volatilityPct: momentum.volatilityPct,
    targetDistance: targetDistance.proximityBand,
    targetDistanceAbs: targetDistance.distanceAbs,
    targetDistancePct: targetDistance.distancePct,
    remainingTimeSec: input.timeRemainingSec,
    reversalRisk: classifyRisk(reversalRisk.riskScore),
    reversalRiskScore: reversalRisk.riskScore,
    entryPlan,
    protections: {
      spreadBlocked: bookImbalance.spread >= 0.03,
      thinBookPenalty: bookImbalance.thinBook,
      lateEntryRisk: input.timeRemainingSec < 20,
      reversalRisk: reversalRisk.riskScore
    },
    subscores: {
      divergence: divergence.score,
      momentum: momentum.score,
      bookImbalance: bookImbalance.score,
      tradePressure: tradePressure.score,
      timeRemaining: timeFactor.score,
      targetDistance: targetDistance.score
    },
    diagnostics: {
      divergence,
      momentum,
      bookImbalance,
      tradePressure,
      timeFactor,
      targetDistance,
      protectionsPenalty,
      reversalRisk
    }
  };
}
