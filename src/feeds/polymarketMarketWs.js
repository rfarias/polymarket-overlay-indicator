import EventEmitter from 'node:events';
import WebSocket from 'ws';
import {
  extractMarketId,
  inferEventType,
  marketSearchText,
  normalizeOrderbook,
  normalizeTrade,
  resolveExpiry,
  resolveTargetPrice,
  shouldTrackAsBtc
} from './activeMarketResolver.js';

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class PolymarketMarketFeed extends EventEmitter {
  constructor({ wsUrl, explicitMarketIds = [], debug = false }) {
    super();
    this.wsUrl = wsUrl;
    this.explicitMarketIds = explicitMarketIds.filter(Boolean);
    this.debug = debug;
    this.ws = null;
    this.activeMarketId = null;
    this.preferredHint = '';
    this.meta = {};
    this.reconnectTimer = null;
  }

  connect() {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.emit('status', { feed: 'market', ok: true, ts: Date.now() });

      if (this.explicitMarketIds.length > 0) {
        this.subscribe(this.explicitMarketIds);
      } else {
        this.ws.send(JSON.stringify({ type: 'subscribe', channel: 'market' }));
      }
    });

    this.ws.on('message', (data) => {
      const payload = parseJsonSafe(data.toString());
      if (!payload) return;
      this.handleMessage(payload);
    });

    this.ws.on('close', () => this.scheduleReconnect());
    this.ws.on('error', () => this.scheduleReconnect());
  }

  subscribe(marketIds) {
    const unique = [...new Set(marketIds.filter(Boolean))];
    if (!unique.length || this.ws?.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'subscribe',
        channel: 'market',
        market_ids: unique
      })
    );
  }

  setPreferredHint(hint = '') {
    this.preferredHint = String(hint || '').toLowerCase().trim();
    if (!this.preferredHint) return;

    const found = Object.entries(this.meta).find(([_, meta]) => meta.isBtc && meta.searchText?.includes(this.preferredHint));
    if (found?.[0]) {
      this.setActiveMarket(found[0]);
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.emit('status', { feed: 'market', ok: false, ts: Date.now() });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  setActiveMarket(id) {
    if (!id) return;
    if (this.activeMarketId !== id) {
      this.activeMarketId = id;
      this.emit('market:selected', { marketId: id, meta: this.meta[id] || {} });
      if (this.debug) console.log('[market] active market:', id);
    }
  }

  handleMessage(payload) {
    const eventType = inferEventType(payload);
    const marketId = extractMarketId(payload);

    if (marketId) {
      const old = this.meta[marketId] || {};
      const searchText = `${old.searchText || ''} ${marketSearchText(payload)}`.trim();
      this.meta[marketId] = {
        ...old,
        targetPrice: resolveTargetPrice(payload) ?? old.targetPrice ?? null,
        expiryTs: resolveExpiry(payload) ?? old.expiryTs ?? null,
        isBtc: shouldTrackAsBtc(payload) || old.isBtc || false,
        searchText,
        updatedAt: Date.now()
      };

      if (this.preferredHint && this.meta[marketId].searchText.includes(this.preferredHint)) {
        this.setActiveMarket(marketId);
      } else if (!this.activeMarketId && this.meta[marketId].isBtc) {
        this.setActiveMarket(marketId);
      }
    }

    if (!this.activeMarketId && this.explicitMarketIds.length) {
      this.setActiveMarket(this.explicitMarketIds[0]);
    }

    const activeId = this.activeMarketId;
    if (!activeId || (marketId && marketId !== activeId)) return;

    if (eventType.includes('book') || payload.bids || payload.asks) {
      this.emit('orderbook', {
        marketId: activeId,
        orderbook: normalizeOrderbook(payload),
        raw: payload,
        ts: Date.now()
      });
    }

    if (eventType.includes('trade') || payload.match_price || payload.taker_side) {
      this.emit('trade', {
        marketId: activeId,
        trade: normalizeTrade(payload),
        raw: payload,
        ts: Date.now()
      });
    }

    if (payload.price || payload.px) {
      this.emit('price', {
        marketId: activeId,
        price: Number(payload.price ?? payload.px) || 0,
        ts: Date.now()
      });
    }

    if (this.meta[activeId]) {
      this.emit('market:meta', { marketId: activeId, meta: this.meta[activeId] });
    }
  }
}
