import { Adapter, MarketSummary, ProbabilityEstimate, ResolutionClassification, SourceState } from "../types.js";

export abstract class BaseAdapter implements Adapter {
  abstract name: string;

  abstract canHandle(market: MarketSummary, classification: ResolutionClassification): boolean;
  abstract fetchCurrentState(market: MarketSummary): Promise<SourceState>;
  abstract estimateProbability(market: MarketSummary, sourceState: SourceState): Promise<ProbabilityEstimate>;

  getConfidence(): number {
    return 0.5;
  }

  getLatencyInfo(): string {
    return "No adapter-specific latency model.";
  }

  getResolutionRisk(): number {
    return 0.35;
  }
}
