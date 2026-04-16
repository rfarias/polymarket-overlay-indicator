const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function classifyLag(uiDelayMs) {
  if (!Number.isFinite(uiDelayMs) || uiDelayMs <= 300) return 'low';
  if (uiDelayMs <= 1200) return 'medium';
  return 'high';
}

function classifyConflict(deltaFeedVsExternal) {
  if (!Number.isFinite(deltaFeedVsExternal) || deltaFeedVsExternal <= 10) return 'low';
  if (deltaFeedVsExternal <= 40) return 'medium';
  return 'high';
}

export function computeLatencyDelta({
  uiPrice,
  uiUpdatedAt,
  feedPrice,
  feedUpdatedAt,
  externalPrice,
  externalUpdatedAt,
  now = Date.now()
}) {
  const hasUi = Number.isFinite(uiPrice);
  const hasFeed = Number.isFinite(feedPrice);
  const hasExternal = Number.isFinite(externalPrice);

  const deltaUiVsFeed = hasUi && hasFeed ? Math.abs(uiPrice - feedPrice) : null;
  const deltaFeedVsExternal = hasFeed && hasExternal ? Math.abs(feedPrice - externalPrice) : null;

  const uiDelayMs = hasUi && feedUpdatedAt
    ? Math.max(0, (feedUpdatedAt || now) - (uiUpdatedAt || 0))
    : null;

  const feedFreshnessMs = feedUpdatedAt ? Math.max(0, now - feedUpdatedAt) : null;
  const externalFreshnessMs = externalUpdatedAt ? Math.max(0, now - externalUpdatedAt) : null;

  const uiLagStatus = classifyLag(uiDelayMs);
  const sourceConflict = classifyConflict(deltaFeedVsExternal);

  // Ajuste de confiança: uiLag sozinho NÃO penaliza.
  let confidenceAdjustment = 0;

  // Feed stale penaliza forte.
  if (Number.isFinite(feedFreshnessMs) && feedFreshnessMs > 2000) confidenceAdjustment -= 20;
  else if (Number.isFinite(feedFreshnessMs) && feedFreshnessMs > 1000) confidenceAdjustment -= 12;
  else if (Number.isFinite(feedFreshnessMs) && feedFreshnessMs > 500) confidenceAdjustment -= 6;

  // Conflito entre fontes penaliza.
  if (sourceConflict === 'high') confidenceAdjustment -= 12;
  else if (sourceConflict === 'medium') confidenceAdjustment -= 6;

  // Se tudo alinhado e fresco, bônus pequeno.
  const aligned = (!Number.isFinite(deltaUiVsFeed) || deltaUiVsFeed < 10) && (!Number.isFinite(deltaFeedVsExternal) || deltaFeedVsExternal < 10);
  const fresh = Number.isFinite(feedFreshnessMs) && feedFreshnessMs < 300;
  if (aligned && fresh && sourceConflict === 'low') confidenceAdjustment += 4;

  return {
    uiPrice: hasUi ? uiPrice : null,
    feedPrice: hasFeed ? feedPrice : null,
    externalPrice: hasExternal ? externalPrice : null,
    deltaUiVsFeed,
    deltaFeedVsExternal,
    uiDelayMs,
    feedFreshnessMs,
    externalFreshnessMs,
    uiLagStatus,
    sourceConflict,
    confidenceAdjustment: clamp(confidenceAdjustment, -30, 10)
  };
}
