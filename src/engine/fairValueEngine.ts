import { config } from "../config.js";
import { Opportunity, OrderBookSnapshot, ProbabilityEstimate, ResolutionClassification, MarketSummary } from "../types.js";
import { clamp } from "../utils/http.js";

export class FairValueEngine {
  buildOpportunity(
    market: MarketSummary,
    classification: ResolutionClassification,
    orderBook: OrderBookSnapshot,
    estimate?: ProbabilityEstimate,
    sourceState?: Opportunity["sourceState"]
  ): Opportunity {
    const fairYes = estimate?.fairYes;
    const fairNo = fairYes === undefined ? undefined : 1 - fairYes;
    const edgeBuyYes = fairYes !== undefined && orderBook.bestYesAsk !== undefined ? fairYes - orderBook.bestYesAsk : undefined;
    const edgeBuyNo = fairNo !== undefined && orderBook.bestNoAsk !== undefined ? fairNo - orderBook.bestNoAsk : undefined;
    const edgeSellYes = fairYes !== undefined && orderBook.bestYesBid !== undefined ? orderBook.bestYesBid - fairYes : undefined;
    const edgeSellNo = fairNo !== undefined && orderBook.bestNoBid !== undefined ? orderBook.bestNoBid - fairNo : undefined;
    const grossEdge = Math.max(edgeBuyYes ?? -1, edgeBuyNo ?? -1, edgeSellYes ?? -1, edgeSellNo ?? -1);
    const risk = clamp(
      classification.ambiguityRisk * 0.35 +
        (estimate?.sourceRisk ?? 0.6) * 0.25 +
        (estimate?.latencyRisk ?? 0.4) * 0.2 +
        (estimate?.resolutionRisk ?? 0.5) * 0.2
    );
    const costs = (orderBook.spread ?? 0.03) + 0.01 + risk * 0.03;
    const netEdge = Number.isFinite(grossEdge) ? grossEdge - costs : undefined;
    const confidence = clamp(((estimate?.confidence ?? 0.1) + classification.confidence) / 2);

    return {
      market,
      classification,
      sourceState,
      estimate,
      orderBook,
      fairYes,
      fairNo,
      edgeBuyYes,
      edgeBuyNo,
      edgeSellYes,
      edgeSellNo,
      netEdge,
      confidence,
      risk,
      suggestion: "WATCH",
      reasons: [],
      createdAt: new Date().toISOString()
    };
  }
}

export function isCandidate(opportunity: Opportunity): boolean {
  return (
    (opportunity.netEdge ?? -1) >= config.minNetEdge &&
    opportunity.confidence >= config.minConfidence &&
    (opportunity.orderBook.topLiquidity ?? opportunity.market.liquidity) >= config.minLiquidity
  );
}
