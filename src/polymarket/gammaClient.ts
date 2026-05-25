import { config } from "../config.js";
import { MarketSummary } from "../types.js";
import { fetchJson, toNumber } from "../utils/http.js";

type GammaEvent = Record<string, unknown> & {
  id?: string | number;
  slug?: string;
  title?: string;
  description?: string;
  markets?: GammaMarket[];
  tags?: Array<{ label?: string; slug?: string } | string>;
};

type GammaMarket = Record<string, unknown> & {
  id?: string | number;
  question?: string;
  description?: string;
  slug?: string;
  outcomes?: unknown;
  clobTokenIds?: unknown;
};

export class GammaClient {
  constructor(private readonly baseUrl = config.gammaApiBase) {}

  async fetchActiveEvents(limit = config.scanLimit, maxPages = config.scanMaxPages): Promise<MarketSummary[]> {
    const markets: MarketSummary[] = [];

    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * limit;
      const url = `${this.baseUrl}/events?active=true&closed=false&limit=${limit}&offset=${offset}`;
      const events = await fetchJson<GammaEvent[]>(url);
      if (events.length === 0) break;

      for (const event of events) {
        for (const market of event.markets ?? []) {
          markets.push(this.normalizeMarket(event, market));
        }
      }

      if (events.length < limit) break;
    }

    return markets;
  }

  async fetchEventMarketsBySlug(slug: string): Promise<MarketSummary[]> {
    const url = `${this.baseUrl}/events?slug=${encodeURIComponent(slug)}`;
    const events = await fetchJson<GammaEvent[]>(url);
    const markets: MarketSummary[] = [];
    for (const event of events) {
      for (const market of event.markets ?? []) {
        markets.push(this.normalizeMarket(event, market));
      }
    }
    return markets;
  }

  private normalizeMarket(event: GammaEvent, market: GammaMarket): MarketSummary {
    const outcomes = parseArray(market.outcomes);
    const tokenIds = parseArray(market.clobTokenIds ?? market["tokenIds"]);
    const bestBid = toOptionalNumber(market["bestBid"] ?? market["best_bid"]);
    const bestAsk = toOptionalNumber(market["bestAsk"] ?? market["best_ask"]);
    const tags = normalizeTags(event.tags);
    const title = String(market.question ?? event.title ?? "Untitled market");
    const description = String(market.description ?? event.description ?? "");
    const resolutionRules = String(
      market["resolutionRules"] ??
        market["rules"] ??
        market["umaResolutionStatus"] ??
        event["resolutionRules"] ??
        event["rules"] ??
        description
    );

    return {
      eventId: String(event.id ?? ""),
      marketId: String(market.id ?? ""),
      slug: String(market.slug ?? event.slug ?? ""),
      title,
      description,
      resolutionRules,
      endDate: String(market["endDate"] ?? market["end_date"] ?? event["endDate"] ?? event["end_date"] ?? ""),
      category: String(event["category"] ?? market["category"] ?? ""),
      tags,
      volume: toNumber(market["volume"] ?? event["volume"]),
      liquidity: toNumber(market["liquidity"] ?? event["liquidity"]),
      outcomes,
      tokenIds,
      bestBid,
      bestAsk,
      spread: bestBid !== undefined && bestAsk !== undefined ? Math.max(0, bestAsk - bestBid) : undefined,
      active: Boolean(market["active"] ?? event["active"] ?? true),
      closed: Boolean(market["closed"] ?? event["closed"] ?? false),
      acceptingOrders: Boolean(market["acceptingOrders"] ?? market["accepting_orders"] ?? true),
      raw: { event, market }
    };
  }
}

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalizeTags(tags: GammaEvent["tags"]): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => (typeof tag === "string" ? tag : tag.label ?? tag.slug ?? "")).filter(Boolean);
}

function toOptionalNumber(value: unknown): number | undefined {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}
