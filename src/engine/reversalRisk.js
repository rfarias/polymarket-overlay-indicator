const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function computeReversalRisk({ momentum, tradePressure, bookImbalance, timeRemainingSec }) {
  const oppositeFlow = Math.sign(momentum.score) !== 0 && Math.sign(momentum.score) !== Math.sign(tradePressure.score);
  const weakBook = bookImbalance.thinBook || bookImbalance.emptyLevels >= 3;
  const lateStage = timeRemainingSec < 45;

  let risk = 20;
  if (oppositeFlow) risk += 30;
  if (weakBook) risk += 20;
  if (lateStage) risk += 20;
  risk += Math.min(Math.abs(momentum.acceleration) * 10, 20);

  return {
    oppositeFlow,
    weakBook,
    lateStage,
    riskScore: clamp(risk, 0, 100)
  };
}
