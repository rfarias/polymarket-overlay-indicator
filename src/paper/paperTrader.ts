import { config } from "../config.js";
import { Opportunity } from "../types.js";

export interface PaperTrade {
  id?: number;
  marketId: string;
  slug: string;
  side: "BUY_YES" | "BUY_NO" | "SELL_YES" | "SELL_NO";
  price: number;
  fair: number;
  stake: number;
  netEdge: number;
  status: "OPEN" | "CLOSED" | "SKIPPED";
  reason: string;
  createdAt: string;
}

export class PaperTrader {
  maybeCreateTrade(opportunity: Opportunity): PaperTrade | undefined {
    if (opportunity.suggestion !== "TRADE_CANDIDATE" && opportunity.suggestion !== "ALERT") return undefined;

    const choices = [
      ["BUY_YES", opportunity.edgeBuyYes, opportunity.orderBook.bestYesAsk, opportunity.fairYes],
      ["BUY_NO", opportunity.edgeBuyNo, opportunity.orderBook.bestNoAsk, opportunity.fairNo]
    ] as const;

    const best = choices
      .filter(([, edge, price, fair]) => edge !== undefined && price !== undefined && fair !== undefined)
      .sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1))[0];

    if (!best || opportunity.netEdge === undefined) return undefined;
    const [side, , price, fair] = best;

    return {
      marketId: opportunity.market.marketId,
      slug: opportunity.market.slug,
      side,
      price: price!,
      fair: fair!,
      stake: config.maxPaperStake,
      netEdge: opportunity.netEdge,
      status: "OPEN",
      reason: opportunity.estimate?.reason ?? opportunity.reasons.join(" "),
      createdAt: new Date().toISOString()
    };
  }
}
