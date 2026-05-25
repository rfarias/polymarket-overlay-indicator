import { BaseAdapter } from "./baseAdapter.js";
import { MarketSummary, ProbabilityEstimate, ResolutionClassification, SourceState } from "../types.js";

export class OfficialWebsiteAdapter extends BaseAdapter {
  name = "official-website";

  canHandle(_market: MarketSummary, classification: ResolutionClassification): boolean {
    return classification.type === "OFFICIAL_WEBSITE";
  }

  async fetchCurrentState(market: MarketSummary): Promise<SourceState> {
    return {
      adapter: this.name,
      observedAt: new Date().toISOString(),
      stale: false,
      details: {
        status: "watch-only",
        reason: "Official website monitoring needs market-specific URL extraction and content rules.",
        market: market.slug
      }
    };
  }

  async estimateProbability(): Promise<ProbabilityEstimate> {
    return {
      fairYes: 0.5,
      confidence: 0.2,
      sourceRisk: 0.55,
      latencyRisk: 0.35,
      resolutionRisk: this.getResolutionRisk(),
      reason: "Official source adapter is watch-only until URL and objective parsing rules are confirmed."
    };
  }

  override getConfidence(): number {
    return 0.25;
  }

  override getResolutionRisk(): number {
    return 0.45;
  }
}
