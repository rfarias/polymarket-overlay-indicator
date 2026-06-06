import fs from 'node:fs/promises';
import path from 'node:path';

import { loadCoinbaseCandles } from './fetchCoinbaseCandles.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const TIMEFRAMES = [5, 15, 60];
const SETUPS = ['continuation', 'reversalReclaim', 'balanceBreakout', 'lateAcceleration', 'composite'];

const CONFIG = {
  lookbackDays: Number(process.env.RESEARCH_LOOKBACK_DAYS || 45),
  outputDir: path.resolve(process.cwd(), 'research-output'),
  minHistoryMinutes: 90,
  near50ZLimit: {
    5: 0.35,
    15: 0.4,
    60: 0.45
  }
};

const PHASE_BINS = [
  { name: 'early', min: 0.0, max: 0.33 },
  { name: 'mid', min: 0.33, max: 0.66 },
  { name: 'late', min: 0.66, max: 1.01 }
];

const SENSITIVITY_LIMITS = {
  5: [0.25, 0.35, 0.45],
  15: [0.3, 0.4, 0.5],
  60: [0.35, 0.45, 0.55]
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function pctChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !from) return 0;
  return ((to - from) / from) * 100;
}

function bpsChange(from, to) {
  return pctChange(from, to) * 100;
}

function rollingReturn(rows, index, minutes) {
  const ref = rows[index - minutes];
  if (!ref) return 0;
  return bpsChange(ref.close, rows[index].close);
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

function wilsonLowerBound(wins, total, confidence = 1.96) {
  if (!total) return 0;
  const p = wins / total;
  const z2 = confidence ** 2;
  const denom = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = confidence * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return (center - margin) / denom;
}

function chunkByWeek(signals) {
  const buckets = new Map();

  for (const signalRow of signals) {
    const date = new Date(signalRow.signalTs);
    const weekKey = `${date.getUTCFullYear()}-W${Math.ceil((date.getUTCDate() + (new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).getUTCDay() || 7) - 1) / 7)}`;
    const bucket = buckets.get(weekKey) || [];
    bucket.push(signalRow);
    buckets.set(weekKey, bucket);
  }

  return [...buckets.entries()].map(([period, rows]) => ({
    period,
    signals: rows.length,
    accuracy: mean(rows.map((row) => row.correct ? 1 : 0))
  }));
}

function buildWindowFeatures(rows, windowStart, windowEnd, currentIndex, timeframeMin) {
  const startRow = rows[windowStart];
  const currentRow = rows[currentIndex];
  const finalRow = rows[windowEnd];
  const elapsedMin = currentIndex - windowStart;
  const remainingMin = windowEnd - currentIndex;
  const windowRows = rows.slice(windowStart, currentIndex + 1);
  const sessionHigh = Math.max(...windowRows.map((row) => row.high));
  const sessionLow = Math.min(...windowRows.map((row) => row.low));
  const trailing5 = rows.slice(Math.max(0, currentIndex - 5), currentIndex + 1);
  const trailing10 = rows.slice(Math.max(0, currentIndex - 10), currentIndex + 1);
  const trailing20 = rows.slice(Math.max(0, currentIndex - 20), currentIndex + 1);
  const prior5 = rows.slice(Math.max(windowStart, currentIndex - 5), currentIndex);
  const prior10 = rows.slice(Math.max(windowStart, currentIndex - 10), currentIndex);
  const prior30 = rows.slice(Math.max(0, currentIndex - 30), currentIndex + 1);
  const priorReturns = [];

  for (let i = Math.max(1, currentIndex - 30); i <= currentIndex; i += 1) {
    priorReturns.push(bpsChange(rows[i - 1].close, rows[i].close));
  }

  const realizedVolBps = stddev(priorReturns);
  const sigmaRemainingBps = Math.max(1, realizedVolBps * Math.sqrt(Math.max(1, remainingMin)));
  const retFromOpenBps = bpsChange(startRow.open, currentRow.close);
  const finalRetFromOpenBps = bpsChange(startRow.open, finalRow.close);
  const zToTarget = retFromOpenBps / sigmaRemainingBps;
  const mom1 = rollingReturn(rows, currentIndex, 1);
  const mom3 = rollingReturn(rows, currentIndex, 3);
  const mom5 = rollingReturn(rows, currentIndex, 5);
  const mom10 = rollingReturn(rows, currentIndex, 10);
  const trend15 = rollingReturn(rows, currentIndex, 15);
  const trend30 = rollingReturn(rows, currentIndex, 30);
  const acceleration = mom3 - mom10;
  const recentFlips = countSignFlips(priorReturns.slice(-8));
  const trailing5High = Math.max(...trailing5.map((row) => row.high));
  const trailing5Low = Math.min(...trailing5.map((row) => row.low));
  const trailing10High = Math.max(...trailing10.map((row) => row.high));
  const trailing10Low = Math.min(...trailing10.map((row) => row.low));
  const trailing20High = Math.max(...trailing20.map((row) => row.high));
  const trailing20Low = Math.min(...trailing20.map((row) => row.low));
  const prior5High = prior5.length ? Math.max(...prior5.map((row) => row.high)) : currentRow.high;
  const prior5Low = prior5.length ? Math.min(...prior5.map((row) => row.low)) : currentRow.low;
  const prior10High = prior10.length ? Math.max(...prior10.map((row) => row.high)) : currentRow.high;
  const prior10Low = prior10.length ? Math.min(...prior10.map((row) => row.low)) : currentRow.low;
  const microRangeBps = bpsChange(prior5Low || currentRow.close, prior5High || currentRow.close);
  const balanceCompression = Math.abs(microRangeBps) <= Math.max(12, realizedVolBps * 1.4);
  const crossedOpenUp = currentRow.close > startRow.open && rows[currentIndex - 1]?.close <= startRow.open;
  const crossedOpenDown = currentRow.close < startRow.open && rows[currentIndex - 1]?.close >= startRow.open;
  const sessionExcursionUpBps = bpsChange(startRow.open, sessionHigh);
  const sessionExcursionDownBps = Math.abs(bpsChange(startRow.open, sessionLow));
  const finalDirection = sign(finalRetFromOpenBps) >= 0 ? 'UP' : 'DOWN';
  const currentDirection = sign(retFromOpenBps) >= 0 ? 'UP' : 'DOWN';
  const rangeWidth = Math.max(0.0001, sessionHigh - sessionLow);
  const rangePosition = (currentRow.close - sessionLow) / rangeWidth;

  return {
    timeframeMin,
    signalTs: currentRow.ts,
    windowStartTs: startRow.ts,
    windowEndTs: finalRow.ts,
    openPrice: startRow.open,
    currentPrice: currentRow.close,
    closePrice: finalRow.close,
    elapsedMin,
    remainingMin,
    elapsedFrac: elapsedMin / timeframeMin,
    remainingFrac: remainingMin / timeframeMin,
    retFromOpenBps,
    finalRetFromOpenBps,
    finalDirection,
    currentDirection,
    zToTarget,
    realizedVolBps,
    sigmaRemainingBps,
    mom1,
    mom3,
    mom5,
    mom10,
    trend15,
    trend30,
    acceleration,
    recentFlips,
    trailing5High,
    trailing5Low,
    trailing10High,
    trailing10Low,
    trailing20High,
    trailing20Low,
    prior5High,
    prior5Low,
    prior10High,
    prior10Low,
    balanceCompression,
    crossedOpenUp,
    crossedOpenDown,
    sessionExcursionUpBps,
    sessionExcursionDownBps,
    rangePosition
  };
}

function near50Filter(features) {
  return Math.abs(features.zToTarget) <= CONFIG.near50ZLimit[features.timeframeMin];
}

function directionName(rawSign) {
  return rawSign >= 0 ? 'UP' : 'DOWN';
}

function makeSignal(setup, direction, confidence, reason, features) {
  return {
    setup,
    direction,
    confidence: Math.round(confidence),
    reason,
    correct: direction === features.finalDirection,
    signalTs: features.signalTs,
    timeframeMin: features.timeframeMin,
    elapsedFrac: features.elapsedFrac,
    retFromOpenBps: features.retFromOpenBps,
    zToTarget: features.zToTarget,
    realizedVolBps: features.realizedVolBps
  };
}

function evaluateContinuation(features) {
  const aligned = sign(features.retFromOpenBps) !== 0
    && sign(features.retFromOpenBps) === sign(features.mom3)
    && sign(features.retFromOpenBps) === sign(features.mom10);

  if (!near50Filter(features)) return null;
  if (features.elapsedFrac < 0.25 || features.elapsedFrac > 0.72) return null;
  if (!aligned) return null;
  const minDrive = features.timeframeMin === 5
    ? Math.max(2.5, features.realizedVolBps * 0.45)
    : Math.max(5, features.realizedVolBps * 0.7);

  if (Math.abs(features.retFromOpenBps) < minDrive) return null;
  if (features.recentFlips > 2) return null;

  const direction = directionName(sign(features.retFromOpenBps));
  const confidence = 54
    + Math.min(10, Math.abs(features.mom3) / 3)
    + Math.min(8, Math.abs(features.mom10) / 4)
    - (features.recentFlips * 2);

  return makeSignal(
    'continuation',
    direction,
    confidence,
    'Preço levemente de um lado do alvo, com momentum curto e intermediário alinhados e baixa alternância de fluxo.',
    features
  );
}

function evaluateReversalReclaim(features) {
  if (!near50Filter(features)) return null;
  if (features.elapsedFrac < 0.18 || features.elapsedFrac > 0.88) return null;
  if (features.recentFlips > 4) return null;

  const reclaimedUp = features.crossedOpenUp
    && features.sessionExcursionDownBps >= Math.max(8, features.realizedVolBps * 0.9)
    && features.mom3 > Math.max(4, features.realizedVolBps * 0.35)
    && features.acceleration > 0;

  const reclaimedDown = features.crossedOpenDown
    && features.sessionExcursionUpBps >= Math.max(8, features.realizedVolBps * 0.9)
    && features.mom3 < -Math.max(4, features.realizedVolBps * 0.35)
    && features.acceleration < 0;

  if (!reclaimedUp && !reclaimedDown) return null;

  const direction = reclaimedUp ? 'UP' : 'DOWN';
  const confidence = 53
    + Math.min(10, Math.abs(features.mom3) / 3)
    + Math.min(8, Math.abs(features.acceleration) / 3);

  return makeSignal(
    'reversalReclaim',
    direction,
    confidence,
    'Houve excursão contra o lado final provável, seguida por reclaim do alvo com aceleração favorável.',
    features
  );
}

function evaluateBalanceBreakout(features) {
  if (!near50Filter(features)) return null;
  if (features.elapsedFrac < 0.15 || features.elapsedFrac > 0.7) return null;
  if (!features.balanceCompression) return null;

  const breakoutUp = features.currentPrice > features.prior10High
    && features.mom3 > Math.max(features.timeframeMin === 5 ? 2.5 : 5, features.realizedVolBps * 0.4)
    && features.recentFlips <= 2;
  const breakoutDown = features.currentPrice < features.prior10Low
    && features.mom3 < -Math.max(features.timeframeMin === 5 ? 2.5 : 5, features.realizedVolBps * 0.4)
    && features.recentFlips <= 2;

  if (!breakoutUp && !breakoutDown) return null;

  const direction = breakoutUp ? 'UP' : 'DOWN';
  const confidence = 55
    + Math.min(8, Math.abs(features.mom3) / 3)
    + Math.min(6, Math.abs(features.retFromOpenBps) / 4);

  return makeSignal(
    'balanceBreakout',
    direction,
    confidence,
    'Mercado saiu de compressão perto do alvo e rompeu a microfaixa com expansão de momentum.',
    features
  );
}

function evaluateLateAcceleration(features) {
  if (!near50Filter(features)) return null;
  if (features.elapsedFrac < (features.timeframeMin === 5 ? 0.58 : 0.68) || features.elapsedFrac > 0.94) return null;
  if (features.recentFlips > 2) return null;
  if (Math.abs(features.retFromOpenBps) < Math.max(features.timeframeMin === 5 ? 2 : 3, features.realizedVolBps * 0.28)) return null;

  const sameSide = sign(features.retFromOpenBps) === sign(features.mom1)
    && sign(features.retFromOpenBps) === sign(features.mom3)
    && sign(features.acceleration) === sign(features.retFromOpenBps);

  if (!sameSide) return null;

  const direction = directionName(sign(features.retFromOpenBps));
  const confidence = 56
    + Math.min(10, Math.abs(features.mom1) / 2)
    + Math.min(10, Math.abs(features.acceleration) / 3);

  return makeSignal(
    'lateAcceleration',
    direction,
    confidence,
    'Trecho final da janela com aceleração favorável no mesmo lado do alvo e baixa alternância.',
    features
  );
}

function evaluateComposite(setups, features) {
  const active = setups.filter(Boolean);
  if (!active.length) return null;

  const up = active.filter((setup) => setup.direction === 'UP');
  const down = active.filter((setup) => setup.direction === 'DOWN');
  if (up.length && down.length) return null;

  const aligned = up.length ? up : down;
  if (aligned.length < 2) return null;

  const direction = aligned[0].direction;
  const confidence = clamp(mean(aligned.map((item) => item.confidence)) + aligned.length * 4, 55, 78);
  const reason = `Confluência de ${aligned.map((item) => item.setup).join(' + ')}.`;
  return makeSignal('composite', direction, confidence, reason, features);
}

function evaluateSignals(features) {
  const continuation = evaluateContinuation(features);
  const reversalReclaim = evaluateReversalReclaim(features);
  const balanceBreakout = evaluateBalanceBreakout(features);
  const lateAcceleration = evaluateLateAcceleration(features);
  const composite = evaluateComposite([continuation, reversalReclaim, balanceBreakout, lateAcceleration], features);

  return [continuation, reversalReclaim, balanceBreakout, lateAcceleration, composite].filter(Boolean);
}

function summarizeSignals(signals) {
  const wins = signals.filter((signalRow) => signalRow.correct).length;
  const accuracy = signals.length ? wins / signals.length : 0;
  const lowerBound = wilsonLowerBound(wins, signals.length);
  const weekly = chunkByWeek(signals);
  const weeklyAccuracies = weekly.filter((row) => row.signals >= 3).map((row) => row.accuracy);
  const robustWeeks = weeklyAccuracies.filter((acc) => acc >= 0.5).length;
  const robustness = weeklyAccuracies.length ? robustWeeks / weeklyAccuracies.length : 0;
  const avgConfidence = mean(signals.map((signalRow) => signalRow.confidence));
  const avgAbsZ = mean(signals.map((signalRow) => Math.abs(signalRow.zToTarget)));

  return {
    signals: signals.length,
    wins,
    accuracy,
    lowerBound,
    avgConfidence,
    avgAbsZ,
    robustness,
    weekly
  };
}

function summarizeSubset(signals) {
  const wins = signals.filter((signalRow) => signalRow.correct).length;
  return {
    signals: signals.length,
    wins,
    accuracy: signals.length ? wins / signals.length : 0,
    lowerBound: wilsonLowerBound(wins, signals.length)
  };
}

function buildPhaseBreakdown(signals) {
  return PHASE_BINS.map((bin) => {
    const subset = signals.filter((signalRow) => signalRow.elapsedFrac >= bin.min && signalRow.elapsedFrac < bin.max);
    return {
      phase: bin.name,
      ...summarizeSubset(subset)
    };
  });
}

function buildSensitivity(signals, timeframeMin) {
  const limits = SENSITIVITY_LIMITS[timeframeMin] || [CONFIG.near50ZLimit[timeframeMin]];

  return limits.map((limit) => {
    const subset = signals.filter((signalRow) => Math.abs(signalRow.zToTarget) <= limit);
    return {
      zLimit: limit,
      ...summarizeSubset(subset)
    };
  });
}

function buildRanking(summaryRows) {
  return [...summaryRows]
    .map((row) => ({
      ...row,
      qualityScore: (
        (row.summary.lowerBound - 0.5) * 100
        + Math.min(12, Math.sqrt(row.summary.signals))
        + (row.summary.robustness * 10)
      )
    }))
    .sort((a, b) => b.qualityScore - a.qualityScore);
}

function recommendationForRow(row) {
  const { accuracy, lowerBound, signals } = row.summary;

  if (signals < 25) return 'Amostra pequena; manter em observação.';
  if (lowerBound >= 0.54) return 'Promissor para indicador principal.';
  if (accuracy >= 0.53 && lowerBound >= 0.51) return 'Útil como filtro secundário ou score complementar.';
  return 'Fraco ou instável; não priorizar no overlay.';
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

async function writeReport(report) {
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  const jsonPath = path.join(CONFIG.outputDir, 'directional-edge-report.json');
  const mdPath = path.join(CONFIG.outputDir, 'directional-edge-report.md');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

  const rankingTable = report.ranking.map((row, index) => (
    `| ${index + 1} | ${row.setup} | ${row.timeframeMin}m | ${formatPct(row.summary.accuracy)} | ${row.summary.signals} | ${formatPct(row.summary.lowerBound)} | ${recommendationForRow(row)} |`
  )).join('\n');

  const bestRows = report.ranking.slice(0, 8).map((row) => (
    `- ${row.setup} ${row.timeframeMin}m: ${formatPct(row.summary.accuracy)} em ${row.summary.signals} sinais, lower bound ${formatPct(row.summary.lowerBound)}. ${recommendationForRow(row)}`
  )).join('\n');

  const phaseRows = report.ranking.slice(0, 5).map((row) => {
    const phaseText = row.phaseBreakdown
      .filter((phase) => phase.signals > 0)
      .map((phase) => `${phase.phase} ${formatPct(phase.accuracy)} (${phase.signals})`)
      .join(', ');
    return `- ${row.setup} ${row.timeframeMin}m: ${phaseText}`;
  }).join('\n');

  const sensitivityRows = report.ranking.slice(0, 5).map((row) => {
    const sensitivityText = row.sensitivity
      .filter((item) => item.signals > 0)
      .map((item) => `|z|<=${item.zLimit}: ${formatPct(item.accuracy)} (${item.signals})`)
      .join(', ');
    return `- ${row.setup} ${row.timeframeMin}m: ${sensitivityText}`;
  }).join('\n');

  const markdown = `# Pesquisa de Edge Direcional BTC x Polymarket

## Escopo

- Fonte principal do backtest: candles de 1 minuto do BTC/USD da Coinbase.
- Janela pesquisada: ${report.meta.lookbackDays} dias.
- Timeframes simulados: 5m, 15m e 1h.
- Aproximação para entrada perto de 50c: sinais apenas quando o preço atual está suficientemente próximo do alvo da janela, medido por \`zToTarget\` relativo à volatilidade restante.
- Esta versão mede o edge direcional do ativo subjacente. Ela ainda não incorpora, no ranking principal, o histórico de micropreço/ordem da Polymarket para cada contrato.

## Hipóteses testadas

- Continuação curta: quando o BTC está muito próximo do alvo, mas com momentum curto e intermediário alinhados, o lado atual tende a prevalecer.
- Reversal reclaim: depois de excursão contra o alvo, o reclaim do preço de abertura com aceleração pode carregar a janela até o fechamento.
- Balance breakout: compressão perto do alvo seguida por rompimento curto tende a produzir fechamento na direção do rompimento.
- Late acceleration: no trecho final da janela, aceleração alinhada com o lado atual do alvo pode gerar edge mesmo com odd próxima de 50c.
- Regime neutro: quando há muitas alternâncias e nenhum setup ativo, a hipótese padrão é que não existe edge suficiente.

## Ranking dos setups

| Rank | Setup | Timeframe | Acerto | Sinais | Lower bound | Recomendação |
| --- | --- | --- | --- | --- | --- | --- |
${rankingTable}

## Leituras principais

${bestRows}

## Breakdown por fase da janela

${phaseRows}

## Sensibilidade do filtro "near 50"

${sensitivityRows}

## Proposta de indicador

- Mostrar \`Valor em UP\` ou \`Valor em DOWN\` apenas quando houver setup ativo com qualidade suficiente.
- Exibir \`Confiança\` baseada em score 0-100 derivado da confluência dos setups.
- Informar \`Setup ativo\` com rótulo curto: continuação, reclaim, breakout, aceleração final ou confluência.
- Informar \`Contexto\`: próximo de 50c, volatilidade, fase da janela e motivo resumido do sinal.
- Quando não houver edge: \`Sem edge claro\` / \`Mercado neutro ou ruidoso\`.

## Limitações

- O filtro de entrada perto de 50c é aproximado pelo comportamento do BTC em torno do preço-alvo da janela; não é a odd real tick a tick da Polymarket.
- O backtest não inclui slippage, spread real, atraso de UI, filas do book e distorções específicas do orderbook da Polymarket.
- A robustez é avaliada por semanas dentro da amostra, não por múltiplos regimes de vários meses.
- O ranking favorece setups com melhor lower bound e amostra maior; taxas altas com pouca frequência ficam penalizadas.

## Próximo passo de implementação

- Ligar o overlay atual a um motor novo de \`directional value\`, separado do score agressivo antigo.
- Consumir os dados já existentes do backend: preço BTC, tempo restante, targetPrice e, numa segunda fase, book/trades da Polymarket.
- Emitir no backend um payload com:
  - \`upValue\`
  - \`downValue\`
  - \`confidence\`
  - \`activeSetup\`
  - \`context\`
  - \`near50State\`
  - \`edgeState\`
`;

  await fs.writeFile(mdPath, markdown);
}

async function main() {
  const endTs = Date.now();
  const startTs = endTs - (CONFIG.lookbackDays * DAY_MS);
  const candles = await loadCoinbaseCandles({
    startTs,
    endTs,
    granularitySec: 60
  });

  const usable = candles.filter((row) => Number.isFinite(row.open) && Number.isFinite(row.close));
  const signalsByKey = new Map();

  for (const timeframeMin of TIMEFRAMES) {
    for (let windowStart = CONFIG.minHistoryMinutes; windowStart + timeframeMin < usable.length; windowStart += timeframeMin) {
      const windowEnd = windowStart + timeframeMin;

      for (let currentIndex = windowStart + 1; currentIndex < windowEnd; currentIndex += 1) {
        const features = buildWindowFeatures(usable, windowStart, windowEnd, currentIndex, timeframeMin);
        const signals = evaluateSignals(features);

        for (const signalRow of signals) {
          const key = `${signalRow.setup}:${timeframeMin}`;
          const bucket = signalsByKey.get(key) || [];
          bucket.push(signalRow);
          signalsByKey.set(key, bucket);
        }
      }
    }
  }

  const summaryRows = [];

  for (const setup of SETUPS) {
    for (const timeframeMin of TIMEFRAMES) {
      const key = `${setup}:${timeframeMin}`;
      const signals = signalsByKey.get(key) || [];
      summaryRows.push({
        setup,
        timeframeMin,
        summary: summarizeSignals(signals),
        phaseBreakdown: buildPhaseBreakdown(signals),
        sensitivity: buildSensitivity(signals, timeframeMin)
      });
    }
  }

  const ranking = buildRanking(summaryRows);
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      lookbackDays: CONFIG.lookbackDays,
      candles: usable.length,
      source: 'Coinbase BTC-USD 1m candles',
      near50ZLimit: CONFIG.near50ZLimit
    },
    summaryRows,
    ranking
  };

  await writeReport(report);

  console.log(JSON.stringify({
    ok: true,
    generatedAt: report.meta.generatedAt,
    outputDir: CONFIG.outputDir,
    topRanking: ranking.slice(0, 6).map((row) => ({
      setup: row.setup,
      timeframeMin: row.timeframeMin,
      accuracy: Number(formatPct(row.summary.accuracy).replace('%', '')),
      signals: row.summary.signals,
      lowerBound: Number(formatPct(row.summary.lowerBound).replace('%', ''))
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
