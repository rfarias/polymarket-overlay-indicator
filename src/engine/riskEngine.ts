import { config } from "../config.js";
import { Opportunity } from "../types.js";
import { isCandidate } from "./fairValueEngine.js";
import { hoursUntil } from "../utils/http.js";

export class RiskEngine {
  apply(opportunity: Opportunity): Opportunity {
    const reasons: string[] = [];
    const timeLeft = hoursUntil(opportunity.market.endDate);

    if (opportunity.classification.type === "UNKNOWN") reasons.push("Unknown resolution source.");
    if (opportunity.classification.type === "MANUAL_AMBIGUOUS") reasons.push("Ambiguous/manual resolution risk.");
    if (opportunity.classification.ambiguityRisk >= 0.7) reasons.push("High ambiguity risk.");
    if (!opportunity.market.acceptingOrders) reasons.push("Market is not accepting orders.");
    if ((opportunity.orderBook.topLiquidity ?? opportunity.market.liquidity) < config.minLiquidity) {
      reasons.push("Liquidity below configured minimum.");
    }
    if ((opportunity.orderBook.spread ?? 1) > Math.max(0.08, (opportunity.netEdge ?? 0))) {
      reasons.push("Spread consumes too much of the edge.");
    }
    if (opportunity.sourceState?.stale) reasons.push("External source is stale.");
    if (opportunity.confidence < config.minConfidence) reasons.push("Confidence below threshold.");
    if ((opportunity.netEdge ?? -1) < config.minNetEdge) reasons.push("Net edge below threshold.");
    if (timeLeft !== undefined && timeLeft <= 0) reasons.push("Market end date has passed.");

    let suggestion: Opportunity["suggestion"] = "WATCH";
    if (reasons.some((reason) => /Unknown|Ambiguous|stale|passed/i.test(reason))) {
      suggestion = "AVOID";
    } else if (isCandidate(opportunity) && opportunity.risk < 0.35) {
      suggestion = "TRADE_CANDIDATE";
    } else if (isCandidate(opportunity)) {
      suggestion = "ALERT";
    } else if (opportunity.risk >= 0.65) {
      suggestion = "AVOID";
    }

    return {
      ...opportunity,
      suggestion,
      reasons: reasons.length > 0 ? reasons : ["Passed initial public-source risk filters."]
    };
  }
}
