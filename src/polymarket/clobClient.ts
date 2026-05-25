import { config } from "../config.js";
import { MarketSummary, OrderBookSnapshot } from "../types.js";
import { fetchJson, toNumber } from "../utils/http.js";

type BookResponse = {
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
};

export interface TokenQuote {
  tokenId: string;
  bestBid?: number;
  bestAsk?: number;
  bestBidSize?: number;
  bestAskSize?: number;
  spread?: number;
  topLiquidity: number;
  updatedAt: string;
}

export class ClobClient {
  constructor(private readonly baseUrl = config.clobApiBase) {}

  async getTokenQuote(tokenId: string): Promise<TokenQuote> {
    const book = await this.getBook(tokenId);
    const bid = bestBid(book);
    const ask = bestAsk(book);
    return {
      tokenId,
      bestBid: bid,
      bestAsk: ask,
      bestBidSize: bestBidSize(book),
      bestAskSize: bestAskSize(book),
      spread: bid !== undefined && ask !== undefined ? ask - bid : undefined,
      topLiquidity: topLiquidity(book),
      updatedAt: new Date().toISOString()
    };
  }

  async getOrderBook(market: MarketSummary): Promise<OrderBookSnapshot> {
    const [yesTokenId, noTokenId] = market.tokenIds;
    const [yes, no] = await Promise.all([
      yesTokenId ? this.getBook(yesTokenId).catch(() => undefined) : undefined,
      noTokenId ? this.getBook(noTokenId).catch(() => undefined) : undefined
    ]);

    const bestYesBid = bestBid(yes);
    const bestYesAsk = bestAsk(yes);
    const bestNoBid = bestBid(no);
    const bestNoAsk = bestAsk(no);
    const spread = bestYesBid !== undefined && bestYesAsk !== undefined ? bestYesAsk - bestYesBid : market.spread;

    return {
      marketId: market.marketId,
      yesTokenId,
      noTokenId,
      bestYesBid: bestYesBid ?? market.bestBid,
      bestYesAsk: bestYesAsk ?? market.bestAsk,
      bestNoBid,
      bestNoAsk,
      spread,
      topLiquidity: topLiquidity(yes) + topLiquidity(no),
      depthToFiveTicks: depthToFiveTicks(yes) + depthToFiveTicks(no),
      updatedAt: new Date().toISOString()
    };
  }

  private async getBook(tokenId: string): Promise<BookResponse> {
    return fetchJson<BookResponse>(`${this.baseUrl}/book?token_id=${encodeURIComponent(tokenId)}`);
  }
}

function bestBid(book?: BookResponse): number | undefined {
  const price = book?.bids?.map((bid) => toNumber(bid.price)).sort((a, b) => b - a)[0];
  return Number.isFinite(price) ? price : undefined;
}

function bestAsk(book?: BookResponse): number | undefined {
  const price = book?.asks?.map((ask) => toNumber(ask.price)).sort((a, b) => a - b)[0];
  return Number.isFinite(price) ? price : undefined;
}

function bestBidSize(book?: BookResponse): number | undefined {
  const bid = book?.bids
    ?.map((row) => ({ price: toNumber(row.price), size: toNumber(row.size) }))
    .sort((a, b) => b.price - a.price)[0];
  return bid && Number.isFinite(bid.size) ? bid.size : undefined;
}

function bestAskSize(book?: BookResponse): number | undefined {
  const ask = book?.asks
    ?.map((row) => ({ price: toNumber(row.price), size: toNumber(row.size) }))
    .sort((a, b) => a.price - b.price)[0];
  return ask && Number.isFinite(ask.size) ? ask.size : undefined;
}

function topLiquidity(book?: BookResponse): number {
  const bid = book?.bids?.[0];
  const ask = book?.asks?.[0];
  return toNumber(bid?.size) + toNumber(ask?.size);
}

function depthToFiveTicks(book?: BookResponse): number {
  const bids = book?.bids?.slice(0, 5).reduce((sum, row) => sum + toNumber(row.size), 0) ?? 0;
  const asks = book?.asks?.slice(0, 5).reduce((sum, row) => sum + toNumber(row.size), 0) ?? 0;
  return bids + asks;
}
