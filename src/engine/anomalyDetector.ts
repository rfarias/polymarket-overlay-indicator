import { Adapter, MarketSummary, Opportunity } from "../types.js";
import { ResolutionClassifier } from "../classifiers/resolutionClassifier.js";
import { ClobClient } from "../polymarket/clobClient.js";
import { FairValueEngine } from "./fairValueEngine.js";
import { RiskEngine } from "./riskEngine.js";

export class AnomalyDetector {
  constructor(
    private readonly classifier: ResolutionClassifier,
    private readonly clob: ClobClient,
    private readonly adapters: Adapter[],
    private readonly fairValue: FairValueEngine,
    private readonly risk: RiskEngine
  ) {}

  async analyzeMarket(market: MarketSummary): Promise<Opportunity> {
    const classification = this.classifier.classify(market);
    const orderBook = await this.clob.getOrderBook(market);
    const adapter = this.adapters.find((candidate) => candidate.canHandle(market, classification));

    if (!adapter) {
      return this.risk.apply(this.fairValue.buildOpportunity(market, classification, orderBook));
    }

    const sourceState = await adapter.fetchCurrentState(market);
    const estimate = await adapter.estimateProbability(market, sourceState);
    return this.risk.apply(this.fairValue.buildOpportunity(market, classification, orderBook, estimate, sourceState));
  }
}
