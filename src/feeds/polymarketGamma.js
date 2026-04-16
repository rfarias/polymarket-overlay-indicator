const GAMMA_API = 'https://gamma-api.polymarket.com';

function parseJsonSafe(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function extractSlug(pageUrl = '') {
  try {
    const url = new URL(pageUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const eventIndex = parts.indexOf('event');
    if (eventIndex >= 0 && parts[eventIndex + 1]) return parts[eventIndex + 1];
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function normalizeMarket(raw = {}) {
  const assetIds = parseJsonSafe(raw.clobTokenIds, null)
    || raw.clob_token_ids
    || raw.assets_ids
    || [];

  const event = Array.isArray(raw.events) ? raw.events[0] : raw.event || null;
  const title = [
    raw.question,
    raw.groupItemTitle,
    raw.slug,
    event?.title,
    event?.slug
  ].filter(Boolean).join(' ').toLowerCase();

  return {
    marketId: raw.conditionId || raw.condition_id || raw.market || raw.id || null,
    assetIds: Array.isArray(assetIds) ? assetIds.filter(Boolean).map(String) : [],
    meta: {
      targetPrice: toNumber(raw.groupItemThreshold ?? raw.line ?? raw.strike ?? raw.threshold),
      expiryTs: toTimestamp(raw.endDate || raw.end_date || raw.endDateIso || event?.endDate || event?.endDateIso),
      slug: raw.slug || event?.slug || null,
      title: raw.question || raw.groupItemTitle || event?.title || null
    },
    scoreText: title,
    raw
  };
}

function pickBestMarket(markets, hint = '') {
  const normalizedHint = String(hint || '').toLowerCase().trim();
  const btcWords = ['btc', 'bitcoin'];

  const scored = markets
    .map((market) => {
      let score = 0;
      if (market.marketId) score += 20;
      if (market.assetIds.length >= 2) score += 20;
      if (btcWords.some((word) => market.scoreText.includes(word))) score += 30;
      if (normalizedHint && market.scoreText.includes(normalizedHint)) score += 30;
      if (market.raw?.active) score += 10;
      if (!market.raw?.closed) score += 5;
      return { market, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.market || null;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`gamma request failed: ${res.status}`);
  }

  return res.json();
}

export async function resolvePageMarket({ pageUrl = '', marketHint = '' }) {
  const slug = extractSlug(pageUrl);
  if (!slug) return null;

  const [eventResult, marketResult] = await Promise.allSettled([
    fetchJson(`${GAMMA_API}/events/slug/${encodeURIComponent(slug)}`),
    fetchJson(`${GAMMA_API}/markets/slug/${encodeURIComponent(slug)}`)
  ]);

  const candidates = [];

  if (eventResult.status === 'fulfilled' && Array.isArray(eventResult.value?.markets)) {
    for (const rawMarket of eventResult.value.markets) {
      candidates.push(normalizeMarket(rawMarket));
    }
  }

  if (marketResult.status === 'fulfilled' && marketResult.value) {
    candidates.push(normalizeMarket(marketResult.value));
  }

  return pickBestMarket(candidates, marketHint || slug);
}
