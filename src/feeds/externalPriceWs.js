import EventEmitter from 'node:events';
import WebSocket from 'ws';

function parseJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class ExternalPriceFeed extends EventEmitter {
  constructor({ wsUrl, enabled = false, debug = false }) {
    super();
    this.wsUrl = wsUrl;
    this.enabled = enabled && Boolean(wsUrl);
    this.debug = debug;
    this.ws = null;
    this.reconnectTimer = null;
  }

  connect() {
    if (!this.enabled) {
      this.emit('status', { feed: 'external', ok: false, disabled: true, ts: Date.now() });
      return;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.emit('status', { feed: 'external', ok: true, ts: Date.now() });
    });

    this.ws.on('message', (data) => {
      const payload = parseJsonSafe(data.toString());
      if (!payload) return;

      const symbol = String(payload.symbol || payload.asset || payload.pair || '').toUpperCase();
      if (symbol && !symbol.includes('BTC')) return;

      const price = Number(payload.price ?? payload.btc_price ?? payload.mark_price ?? payload.value);
      if (!Number.isFinite(price) || price <= 0) return;

      this.emit('price', { price, ts: Date.now(), raw: payload });
      if (this.debug) console.log('[external] btc:', price);
    });

    this.ws.on('close', () => this.scheduleReconnect());
    this.ws.on('error', () => this.scheduleReconnect());
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.enabled) return;
    this.emit('status', { feed: 'external', ok: false, ts: Date.now() });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }
}
