import fs from 'node:fs';
import path from 'node:path';
import { calculateAggressiveEdge } from '../engine/aggressiveScore.js';
import { computeLatencyDelta } from '../engine/latencyDelta.js';
import { resolveImpliedOdds } from '../feeds/activeMarketResolver.js';

const LOG_FILE = path.resolve(process.cwd(), 'logs', 'edge-signals.ndjson');

export class RuntimeState {
  constructor() {
    this.marketId = null;
    this.marketMeta = {
      targetPrice: null,
      expiryTs: null
    };
    this.lastOddsPrice = 0.5;
    this.orderbook = { bids: [], asks: [] };
    this.btcHistory = [];
    this.recentTrades = [];
    this.external = { price: null, updatedAt: null };
    this.ui = { price: null, updatedAt: null };
    this.edge = null;
    this.latencyDelta = {
      uiPrice: null,
      feedPrice: null,
      externalPrice: null,
      deltaUiVsFeed: null,
      deltaFeedVsExternal: null,
      uiDelayMs: null,
      feedFreshnessMs: null,
      externalFreshnessMs: null,
      uiLagStatus: 'low',
      sourceConflict: 'low',
      confidenceAdjustment: 0
    };
    this.feedStatus = {
      market: false,
      rtds: false,
      external: false
    };
  }

  setMarket(marketId, meta = {}) {
    this.marketId = marketId || this.marketId;
    this.marketMeta = { ...this.marketMeta, ...meta };
  }

  setStatus(feed, ok) {
    this.feedStatus[feed] = ok;
  }

  updateOrderbook(orderbook) {
    this.orderbook = orderbook;
    this.recompute();
  }

  updateOddsPrice(price) {
    if (Number.isFinite(price) && price > 0) {
      this.lastOddsPrice = price;
      this.recompute();
    }
  }

  pushTrade(trade) {
    this.recentTrades.push(trade);
    if (this.recentTrades.length > 200) {
      this.recentTrades = this.recentTrades.slice(-200);
    }
    this.recompute();
  }

  updateBtc(price, ts = Date.now()) {
    this.btcHistory.push({ price, ts });
    const cutoff = Date.now() - 15_000;
    this.btcHistory = this.btcHistory.filter((point) => point.ts >= cutoff);
    this.recompute();
  }

  updateExternalPrice(price, ts = Date.now()) {
    if (!Number.isFinite(price) || price <= 0) return;
    this.external = { price, updatedAt: ts };
    this.recompute();
  }

  updateUiPrice(price, ts = Date.now()) {
    if (!Number.isFinite(price) || price <= 0) return;
    this.ui = { price, updatedAt: ts };
    this.recompute();
  }

  getTimeRemainingSec() {
    if (!this.marketMeta.expiryTs) return 180;
    return Math.max(0, Math.round((this.marketMeta.expiryTs - Date.now()) / 1000));
  }

  recompute() {
    const bestBid = this.orderbook.bids[0]?.price;
    const bestAsk = this.orderbook.asks[0]?.price;
    const impliedOdds = resolveImpliedOdds({
      bestBid,
      bestAsk,
      lastPrice: this.lastOddsPrice
    });

    const btcPoint = this.btcHistory[this.btcHistory.length - 1];
    const btcPrice = btcPoint?.price;
    const btcUpdatedAt = btcPoint?.ts;
    const timeRemainingSec = this.getTimeRemainingSec();

    const baseEdge = calculateAggressiveEdge({
      btcPrice,
      impliedOdds,
      targetPrice: this.marketMeta.targetPrice,
      orderbook: this.orderbook,
      btcHistory: this.btcHistory,
      recentTrades: this.recentTrades.filter((t) => t.ts >= Date.now() - 10_000),
      timeRemainingSec
    });

    this.latencyDelta = computeLatencyDelta({
      uiPrice: this.ui.price,
      uiUpdatedAt: this.ui.updatedAt,
      feedPrice: btcPrice,
      feedUpdatedAt: btcUpdatedAt,
      externalPrice: this.external.price,
      externalUpdatedAt: this.external.updatedAt
    });

    const adjustedScore = Math.max(0, Math.min(100, baseEdge.score + this.latencyDelta.confidenceAdjustment));
    const adjustedConfidence = adjustedScore >= 80 ? 'Alta' : adjustedScore >= 60 ? 'Média' : adjustedScore >= 40 ? 'Baixa' : 'Muito baixa';

    this.edge = {
      ...baseEdge,
      adjustedScore,
      adjustedConfidence,
      confidenceAdjustment: this.latencyDelta.confidenceAdjustment
    };

    this.persistLog({ btcPrice, impliedOdds, timeRemainingSec });
  }

  persistLog(context) {
    if (!this.edge) return;

    const payload = {
      timestamp: new Date().toISOString(),
      marketId: this.marketId,
      btcPrice: context.btcPrice ?? null,
      odd: context.impliedOdds,
      scoreTotal: this.edge.score,
      adjustedScore: this.edge.adjustedScore,
      subscores: this.edge.subscores,
      direction: this.edge.direction,
      timeRemainingSec: context.timeRemainingSec,
      uiPrice: this.latencyDelta.uiPrice,
      feedPrice: this.latencyDelta.feedPrice,
      externalPrice: this.latencyDelta.externalPrice,
      deltaUiVsFeed: this.latencyDelta.deltaUiVsFeed,
      deltaFeedVsExternal: this.latencyDelta.deltaFeedVsExternal,
      uiDelayMs: this.latencyDelta.uiDelayMs,
      feedFreshnessMs: this.latencyDelta.feedFreshnessMs,
      externalFreshnessMs: this.latencyDelta.externalFreshnessMs,
      uiLagStatus: this.latencyDelta.uiLagStatus,
      sourceConflict: this.latencyDelta.sourceConflict,
      confidenceAdjustment: this.latencyDelta.confidenceAdjustment
    };

    fs.appendFile(LOG_FILE, `${JSON.stringify(payload)}\n`, () => {});
  }

  snapshot() {
    return {
      marketId: this.marketId,
      marketMeta: this.marketMeta,
      feedStatus: this.feedStatus,
      edge: this.edge,
      latencyDelta: this.latencyDelta,
      ts: Date.now()
    };
  }
}
