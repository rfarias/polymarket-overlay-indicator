import { config } from "../config.js";
import { BaseAdapter } from "./baseAdapter.js";
import { MarketSummary, ProbabilityEstimate, ResolutionClassification, SourceState } from "../types.js";
import { clamp, fetchJson, hoursUntil } from "../utils/http.js";

type BinanceTicker = { price: string };

export class ExchangePriceAdapter extends BaseAdapter {
  name = "exchange-price";

  canHandle(market: MarketSummary, classification: ResolutionClassification): boolean {
    const text = `${market.title} ${market.description} ${market.resolutionRules}`;
    return classification.type === "EXCHANGE_PRICE" && /\bBTC\b|bitcoin/i.test(text);
  }

  async fetchCurrentState(market: MarketSummary): Promise<SourceState> {
    const ticker = await fetchJson<BinanceTicker>(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(config.binanceSymbol)}`
    );
    const value = Number(ticker.price);
    const target = extractTargetPrice(`${market.title}\n${market.description}\n${market.resolutionRules}`);

    return {
      adapter: this.name,
      observedAt: new Date().toISOString(),
      value,
      target,
      direction: inferDirection(market.title),
      stale: false,
      details: {
        venue: "Binance public ticker",
        symbol: config.binanceSymbol
      }
    };
  }

  async estimateProbability(market: MarketSummary, sourceState: SourceState): Promise<ProbabilityEstimate> {
    if (!sourceState.value || !sourceState.target) {
      return {
        fairYes: 0.5,
        confidence: 0.25,
        sourceRisk: 0.45,
        latencyRisk: 0.25,
        resolutionRisk: this.getResolutionRisk(),
        reason: "Could not extract a target price from market text."
      };
    }

    const timeHours = Math.max(0.05, hoursUntil(market.endDate) ?? 24);
    const distance = (sourceState.value - sourceState.target) / sourceState.target;
    const dailyVol = 0.035;
    const timeVol = dailyVol * Math.sqrt(timeHours / 24);
    const z = distance / Math.max(timeVol, 0.003);
    const fairAbove = clamp(1 / (1 + Math.exp(-z)));
    const direction = sourceState.direction ?? "ABOVE";
    const fairYes = direction === "DOWN" || direction === "BELOW" ? 1 - fairAbove : fairAbove;
    const confidence = clamp(0.45 + Math.min(Math.abs(z), 2) * 0.15);

    return {
      fairYes,
      confidence,
      sourceRisk: 0.25,
      latencyRisk: 0.18,
      resolutionRisk: this.getResolutionRisk(),
      reason: `Estimated from Binance BTC spot vs target ${sourceState.target}.`
    };
  }

  override getConfidence(): number {
    return 0.65;
  }

  override getLatencyInfo(): string {
    return "Public exchange ticker, usually low latency but not necessarily the resolution source.";
  }

  override getResolutionRisk(): number {
    return 0.28;
  }
}

export function extractTargetPrice(text: string): number | undefined {
  const patterns = [
    /\$?\s?(\d{2,3}(?:,\d{3})+(?:\.\d+)?)\s?(?:or|by|at|above|below|over|under)/i,
    /(?:above|below|over|under|target|reach(?:es)?)\s+\$?\s?(\d{2,3}(?:,\d{3})+(?:\.\d+)?)/i,
    /\$?\s?(\d{4,6}(?:\.\d+)?)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1].replace(/,/g, ""));
  }

  return undefined;
}

function inferDirection(text: string): "UP" | "DOWN" | "ABOVE" | "BELOW" {
  if (/down|below|under|less than/i.test(text)) return "BELOW";
  return "ABOVE";
}
