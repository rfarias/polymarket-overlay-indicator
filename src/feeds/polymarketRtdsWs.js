import EventEmitter from 'node:events';
import WebSocket from 'ws';

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class PolymarketRtdsFeed extends EventEmitter {
  constructor({ wsUrl, debug = false }) {
    super();
    this.wsUrl = wsUrl;
    this.debug = debug;
    this.ws = null;
    this.reconnectTimer = null;
  }

  connect() {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.emit('status', { feed: 'rtds', ok: true, ts: Date.now() });
      this.ws.send(JSON.stringify({ type: 'subscribe', channels: ['price'] }));
    });

    this.ws.on('message', (data) => {
      const payload = parseJsonSafe(data.toString());
      if (!payload) return;

      const symbol = String(payload.symbol || payload.asset || payload.pair || '').toUpperCase();
      if (!symbol.includes('BTC') && !payload.btc_price && !payload.price_btc) return;

      const price = Number(payload.price ?? payload.btc_price ?? payload.price_btc ?? payload.value);
      if (!Number.isFinite(price) || price <= 0) return;

      this.emit('btc', {
        price,
        ts: Date.now(),
        raw: payload
      });

      if (this.debug) console.log('[rtds] btc:', price);
    });

    this.ws.on('close', () => this.scheduleReconnect());
    this.ws.on('error', () => this.scheduleReconnect());
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.emit('status', { feed: 'rtds', ok: false, ts: Date.now() });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1200);
  }
}
