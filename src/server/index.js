import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';

import { PolymarketMarketFeed } from '../feeds/polymarketMarketWs.js';
import { PolymarketRtdsFeed } from '../feeds/polymarketRtdsWs.js';
import { ExternalPriceFeed } from '../feeds/externalPriceWs.js';
import { RuntimeState } from './state.js';

const PORT = Number(process.env.PORT || 8787);
const MARKET_WS_URL = process.env.POLYMARKET_MARKET_WS || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const RTDS_WS_URL = process.env.POLYMARKET_RTDS_WS || 'wss://ws-live-data.polymarket.com';
const EXTERNAL_WS_URL = process.env.EXTERNAL_PRICE_WS || '';
const MARKET_IDS = (process.env.MARKET_IDS || '').split(',').map((v) => v.trim()).filter(Boolean);
const DEBUG_FEEDS = String(process.env.DEBUG_FEEDS || 'false') === 'true';

const state = new RuntimeState();
const app = express();
app.use(cors());
app.use(express.json());

const marketFeed = new PolymarketMarketFeed({
  wsUrl: MARKET_WS_URL,
  explicitMarketIds: MARKET_IDS,
  debug: DEBUG_FEEDS
});
const rtdsFeed = new PolymarketRtdsFeed({ wsUrl: RTDS_WS_URL, debug: DEBUG_FEEDS });
const externalFeed = new ExternalPriceFeed({ wsUrl: EXTERNAL_WS_URL, enabled: Boolean(EXTERNAL_WS_URL), debug: DEBUG_FEEDS });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ...state.snapshot() });
});

app.get('/api/edge', (_req, res) => {
  res.json(state.snapshot());
});

app.post('/api/ui-price', (req, res) => {
  const uiPrice = Number(req.body?.uiPrice);
  const uiUpdatedAt = Number(req.body?.uiUpdatedAt) || Date.now();

  if (!Number.isFinite(uiPrice) || uiPrice <= 0) {
    res.status(400).json({ ok: false, error: 'invalid uiPrice' });
    return;
  }

  state.updateUiPrice(uiPrice, uiUpdatedAt);
  broadcast();
  res.json({ ok: true });
});

app.post('/api/ui-context', (req, res) => {
  const pageUrl = String(req.body?.pageUrl || '').toLowerCase();
  const marketHint = String(req.body?.marketHint || '').toLowerCase();

  const slugFromUrl = pageUrl.split('/').filter(Boolean).slice(-1)[0] || '';
  const hint = marketHint || slugFromUrl;

  if (hint) {
    marketFeed.setPreferredHint(hint);
  }

  res.json({ ok: true, hint });
});

app.get('/overlay/user.js', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(new URL('../overlay/overlay.js', import.meta.url).pathname);
});

app.get('/overlay/overlay.css', (_req, res) => {
  res.type('text/css');
  res.sendFile(new URL('../overlay/overlay.css', import.meta.url).pathname);
});

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

const wsBroadcast = new WebSocketServer({ server, path: '/ws/edge' });

function broadcast() {
  const payload = JSON.stringify(state.snapshot());
  wsBroadcast.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

marketFeed.on('status', ({ ok }) => state.setStatus('market', ok));
rtdsFeed.on('status', ({ ok }) => state.setStatus('rtds', ok));
externalFeed.on('status', ({ ok }) => state.setStatus('external', ok));

marketFeed.on('market:selected', ({ marketId, meta }) => {
  state.setMarket(marketId, meta);
  broadcast();
});

marketFeed.on('market:meta', ({ marketId, meta }) => {
  state.setMarket(marketId, meta);
  broadcast();
});

marketFeed.on('orderbook', ({ orderbook }) => {
  state.updateOrderbook(orderbook);
  broadcast();
});

marketFeed.on('trade', ({ trade }) => {
  state.pushTrade(trade);
  broadcast();
});

marketFeed.on('price', ({ price }) => {
  state.updateOddsPrice(price);
  broadcast();
});

rtdsFeed.on('btc', ({ price, ts }) => {
  state.updateBtc(price, ts);
  broadcast();
});

externalFeed.on('price', ({ price, ts }) => {
  state.updateExternalPrice(price, ts);
  broadcast();
});

marketFeed.connect();
rtdsFeed.connect();
externalFeed.connect();

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
