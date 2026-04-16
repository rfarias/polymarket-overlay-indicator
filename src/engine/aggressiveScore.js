import { computeMomentum } from './momentum.js';
import { computeBookImbalance } from './bookImbalance.js';
import { computeTradePressure } from './tradePressure.js';
import { computeReversalRisk } from './reversalRisk.js';
import { computeTargetDistance } from './targetDistance.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function computeDivergence({ btcPrice, impliedOdds, targetPrice }) {
  if (!btcPrice || !targetPrice || !impliedOdds) {
    return { oddsImplied: 0, btcImplied: 0, diff: 0, score: 0 };
  }

  const btcImplied = clamp(50 + ((btcPrice - targetPrice) / targetPrice) * 5000, 1, 99);
  const oddsImplied = clamp(impliedOdds * 100, 1, 99);
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
  if (timeRemainingSec > 180) return { phase: 'momentum', score: 70 };
  if (timeRemainingSec > 90) return { phase: 'balanced', score: 20 };
  if (timeRemainingSec > 45) return { phase: 'decision', score: -10 };
  return { phase: 'target-lock', score: -35 };
}

function scoreBand(score) {
  if (score >= 85) return 'agressivo máximo';
  if (score >= 75) return 'forte';
  if (score >= 60) return 'leve';
  if (score >= 40) return 'formação';
  return 'sem trade';
}

function confidence(score) {
  if (score >= 80) return 'Alta';
  if (score >= 60) return 'Média';
  if (score >= 40) return 'Baixa';
  return 'Muito baixa';
}

export function calculateAggressiveEdge(input) {
  const divergence = computeDivergence(input);
  const momentum = computeMomentum(input.btcHistory);
  const bookImbalance = computeBookImbalance(input.orderbook);
  const tradePressure = computeTradePressure(input.recentTrades);
  const targetDistance = computeTargetDistance(input);
  const timeFactor = computeTimeFactor(input.timeRemainingSec);

  const weightedDirectional =
    (divergence.score * 0.35) +
    (momentum.score * 0.25) +
    (bookImbalance.score * 0.2) +
    (tradePressure.score * 0.1) +
    (timeFactor.score * 0.1);

  let protectionsPenalty = 0;
  if (bookImbalance.spread >= 0.02) protectionsPenalty += 15;
  if (bookImbalance.thinBook) protectionsPenalty += 10;

  const reversalRisk = computeReversalRisk({
    momentum,
    tradePressure,
    bookImbalance,
    timeRemainingSec: input.timeRemainingSec
  });

  protectionsPenalty += reversalRisk.riskScore * 0.15;

  const directional = clamp(weightedDirectional, -100, 100);
  const total = clamp(Math.abs(weightedDirectional) - protectionsPenalty, 0, 100);
  const direction = directional >= 0 ? 'YES' : 'NO';

  const entryBase = Math.round((input.impliedOdds ?? 0.5) * 100);
  const entryLow = clamp(entryBase - 2, 1, 99);
  const entryHigh = clamp(entryBase - 1, 1, 99);
  const shortExitLow = clamp(entryBase + 1, 1, 99);
  const shortExitHigh = clamp(entryBase + 2, 1, 99);
  const lateEntry = clamp(entryBase + 3, 1, 99);

  return {
    score: Math.round(total),
    band: scoreBand(total),
    direction,
    confidence: confidence(total),
    momentumStrength: Math.abs(momentum.score) > 60 ? 'Forte' : Math.abs(momentum.score) > 35 ? 'Moderado' : 'Fraco',
    bookBias: bookImbalance.score > 20 ? 'Favorável' : bookImbalance.score < -20 ? 'Desfavorável' : 'Neutro',
    tradeBias: tradePressure.score > 20 ? 'Compradora' : tradePressure.score < -20 ? 'Vendedora' : 'Mista',
    targetDistance: targetDistance.proximityBand,
    remainingTimeSec: input.timeRemainingSec,
    entryIdeal: `${entryLow}-${entryHigh}`,
    shortExit: `${shortExitLow}-${shortExitHigh}`,
    lateEntryAbove: lateEntry,
    invalidation: reversalRisk.oppositeFlow ? 'Fluxo oposto detectado' : 'Fluxo perdeu força',
    reversalRisk: reversalRisk.riskScore >= 65 ? 'Alto' : reversalRisk.riskScore >= 40 ? 'Médio' : 'Baixo',
    protections: {
      spreadBlocked: bookImbalance.spread >= 0.03,
      thinBookPenalty: bookImbalance.thinBook,
      lateEntryRisk: input.timeRemainingSec < 35,
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
      protectionsPenalty
    }
  };
}
