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
    this.pingTimer = null;
  }

  connect() {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      this.emit('status', { feed: 'rtds', ok: true, ts: Date.now() });
      this.startHeartbeat();
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [
          { topic: 'crypto_prices', type: 'update' }
        ]
      }));
    });

    this.ws.on('message', (data) => {
      const raw = data.toString();
      if (raw === 'PONG' || raw === 'PING') return;

      const message = parseJsonSafe(raw);
      if (!message) return;

      const payload = message.payload || message;
      const symbol = String(payload.symbol || '').toLowerCase();
      if (!symbol.includes('btc')) return;

      const price = Number(payload.value ?? payload.price ?? payload.btc_price ?? payload.price_btc);
      if (!Number.isFinite(price) || price <= 0) return;

      this.emit('btc', {
        price,
        ts: Number(payload.timestamp) || Number(message.timestamp) || Date.now(),
        raw: message
      });

      if (this.debug) console.log('[rtds] btc:', price);
    });

    this.ws.on('close', () => this.scheduleReconnect());
    this.ws.on('error', () => this.scheduleReconnect());
  }

  startHeartbeat() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('PING');
      }
    }, 5000);
  }

  scheduleReconnect() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;

    if (this.reconnectTimer) return;
    this.emit('status', { feed: 'rtds', ok: false, ts: Date.now() });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1200);
  }
}
