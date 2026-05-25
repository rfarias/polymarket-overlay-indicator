import { BaseAdapter } from "./baseAdapter.js";
import { ExchangePriceAdapter, extractTargetPrice } from "./exchangePriceAdapter.js";
import { MarketSummary, ProbabilityEstimate, ResolutionClassification, SourceState } from "../types.js";
import { clamp, fetchJson, hoursUntil } from "../utils/http.js";

type ChainlinkProxyResponse = {
  data?: {
    answer?: string;
    updatedAt?: string;
  };
};

export class ChainlinkBtcAdapter extends BaseAdapter {
  name = "chainlink-btc-usd";

  canHandle(market: MarketSummary, classification: ResolutionClassification): boolean {
    const text = `${market.title} ${market.description} ${market.resolutionRules}`;
    return classification.type === "CHAINLINK_PRICE_FEED" && /btc|bitcoin|btc\/usd/i.test(text);
  }

  async fetchCurrentState(market: MarketSummary): Promise<SourceState> {
    const [chainlink, exchange] = await Promise.allSettled([
      fetchJson<ChainlinkProxyResponse>(
        "https://api.etherscan.io/api?module=proxy&action=eth_call&to=0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c&data=0x50d25bcd&tag=latest"
      ),
      new ExchangePriceAdapter().fetchCurrentState(market)
    ]);

    const exchangeState = exchange.status === "fulfilled" ? exchange.value : undefined;
    const text = `${market.title}\n${market.description}\n${market.resolutionRules}`;
    const target = extractTargetPrice(text);

    return {
      adapter: this.name,
      observedAt: new Date().toISOString(),
      value: exchangeState?.value,
      target,
      direction: exchangeState?.direction,
      stale: false,
      details: {
        note: "Uses public Binance spot as live proxy. Chainlink feed metadata hook is present but depends on provider/API availability.",
        chainlinkResponseAvailable: chainlink.status === "fulfilled",
        exchange: exchangeState?.details
      }
    };
  }

  async estimateProbability(market: MarketSummary, sourceState: SourceState): Promise<ProbabilityEstimate> {
    if (!sourceState.value || !sourceState.target) {
      return {
        fairYes: 0.5,
        confidence: 0.25,
        sourceRisk: 0.4,
        latencyRisk: 0.35,
        resolutionRisk: this.getResolutionRisk(),
        reason: "BTC Chainlink market detected, but target or live price is missing."
      };
    }

    const timeHours = Math.max(0.05, hoursUntil(market.endDate) ?? 12);
    const distance = (sourceState.value - sourceState.target) / sourceState.target;
    const chainlinkUpdateRisk = timeHours < 1 ? 0.25 : 0.15;
    const vol = 0.04 * Math.sqrt(timeHours / 24);
    const z = distance / Math.max(vol, 0.003);
    const fairAbove = clamp(1 / (1 + Math.exp(-z)));
    const fairYes = sourceState.direction === "DOWN" || sourceState.direction === "BELOW" ? 1 - fairAbove : fairAbove;

    return {
      fairYes,
      confidence: clamp(0.5 + Math.min(Math.abs(z), 2) * 0.15 - chainlinkUpdateRisk / 3),
      sourceRisk: 0.22,
      latencyRisk: chainlinkUpdateRisk,
      resolutionRisk: this.getResolutionRisk(),
      reason: `BTC Chainlink-style estimate from public BTC spot, target ${sourceState.target}, ${timeHours.toFixed(1)}h left.`
    };
  }

  override getConfidence(): number {
    return 0.62;
  }

  override getLatencyInfo(): string {
    return "Chainlink rounds can update near market end; stale or pending updates reduce confidence.";
  }

  override getResolutionRisk(): number {
    return 0.22;
  }
}
