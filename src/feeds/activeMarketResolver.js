const BTC_KEYWORDS = ['btc', 'bitcoin'];

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildSearchText(payload = {}) {
  return [
    payload?.market,
    payload?.market_slug,
    payload?.slug,
    payload?.question,
    payload?.title,
    payload?.description,
    payload?.condition_id,
    payload?.asset
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function containsBtcLabel(payload) {
  const fields = buildSearchText(payload);
  return BTC_KEYWORDS.some((k) => fields.includes(k));
}

export function marketSearchText(payload = {}) {
  return buildSearchText(payload);
}

export function inferEventType(payload = {}) {
  return payload.event_type || payload.type || payload.channel || 'unknown';
}

export function extractMarketId(payload = {}) {
  return payload.market_id || payload.market || payload.condition_id || payload.id || null;
}

export function resolveTargetPrice(payload = {}) {
  const raw = payload.target_price || payload.strike || payload.reference_price || payload.threshold;
  return toNumber(raw);
}

export function resolveExpiry(payload = {}) {
  const raw = payload.end_ts || payload.expiry || payload.end_time || payload.closes_at;
  const parsed = raw ? new Date(raw).getTime() : null;
  return Number.isFinite(parsed) ? parsed : null;
}

export function shouldTrackAsBtc(payload = {}) {
  return containsBtcLabel(payload);
}

export function normalizeOrderbook(raw = {}) {
  const normalizeSide = (arr = []) => arr
    .map((l) => ({
      price: toNumber(l.price ?? l.p ?? l[0]) ?? 0,
      size: toNumber(l.size ?? l.s ?? l[1]) ?? 0
    }))
    .filter((l) => l.price > 0)
    .sort((a, b) => b.price - a.price);

  const bids = normalizeSide(raw.bids || raw.buy || []);
  const asks = normalizeSide(raw.asks || raw.sell || []).sort((a, b) => a.price - b.price);

  return { bids, asks };
}

export function normalizeTrade(raw = {}) {
  const side = (raw.side || raw.taker_side || '').toLowerCase().includes('buy') ? 'buy' : 'sell';
  return {
    ts: Date.now(),
    side,
    price: toNumber(raw.price ?? raw.px ?? raw.match_price) ?? 0,
    size: toNumber(raw.size ?? raw.qty ?? raw.amount) ?? 0
  };
}

export function resolveImpliedOdds({ bestBid, bestAsk, lastPrice }) {
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
  const implied = mid || lastPrice || 0.5;
  return Math.max(0.01, Math.min(0.99, implied));
}
