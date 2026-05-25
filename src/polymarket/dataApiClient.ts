import { config } from "../config.js";
import { fetchJson, toNumber } from "../utils/http.js";

export type LeaderboardCategory =
  | "OVERALL"
  | "POLITICS"
  | "SPORTS"
  | "CRYPTO"
  | "CULTURE"
  | "MENTIONS"
  | "WEATHER"
  | "ECONOMICS"
  | "TECH"
  | "FINANCE";

export type LeaderboardPeriod = "DAY" | "WEEK" | "MONTH" | "ALL";

export interface LeaderboardTrader {
  rank: string;
  proxyWallet: string;
  userName?: string;
  vol: number;
  pnl: number;
  profileImage?: string;
  xUsername?: string;
  verifiedBadge?: boolean;
}

export interface UserActivity {
  proxyWallet: string;
  timestamp: number;
  conditionId?: string;
  type?: string;
  side?: "BUY" | "SELL";
  size: number;
  usdcSize: number;
  transactionHash?: string;
  price: number;
  asset?: string;
  outcomeIndex?: number;
  title?: string;
  slug?: string;
  eventSlug?: string;
  outcome?: string;
  name?: string;
  pseudonym?: string;
}

export interface UserPosition {
  proxyWallet: string;
  asset?: string;
  conditionId?: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  realizedPnl: number;
  title?: string;
  slug?: string;
  outcome?: string;
  curPrice: number;
  endDate?: string;
}

type RawLeaderboardTrader = Omit<LeaderboardTrader, "vol" | "pnl"> & {
  vol?: unknown;
  pnl?: unknown;
};

type RawUserActivity = Omit<UserActivity, "timestamp" | "size" | "usdcSize" | "price"> & {
  timestamp?: unknown;
  size?: unknown;
  usdcSize?: unknown;
  price?: unknown;
};

type RawUserPosition = Omit<
  UserPosition,
  "size" | "avgPrice" | "initialValue" | "currentValue" | "cashPnl" | "percentPnl" | "realizedPnl" | "curPrice"
> & {
  size?: unknown;
  avgPrice?: unknown;
  initialValue?: unknown;
  currentValue?: unknown;
  cashPnl?: unknown;
  percentPnl?: unknown;
  realizedPnl?: unknown;
  curPrice?: unknown;
};

export class DataApiClient {
  constructor(private readonly baseUrl = config.dataApiBase) {}

  async leaderboard(params: {
    category?: LeaderboardCategory;
    timePeriod?: LeaderboardPeriod;
    orderBy?: "PNL" | "VOL";
    limit?: number;
    offset?: number;
  } = {}): Promise<LeaderboardTrader[]> {
    const url = new URL("/v1/leaderboard", this.baseUrl);
    url.searchParams.set("category", params.category ?? "OVERALL");
    url.searchParams.set("timePeriod", params.timePeriod ?? "MONTH");
    url.searchParams.set("orderBy", params.orderBy ?? "PNL");
    url.searchParams.set("limit", String(params.limit ?? 25));
    url.searchParams.set("offset", String(params.offset ?? 0));

    const rows = await fetchJson<RawLeaderboardTrader[]>(url.toString());
    return rows.map((row) => ({
      ...row,
      rank: String(row.rank ?? ""),
      proxyWallet: String(row.proxyWallet ?? ""),
      vol: toNumber(row.vol),
      pnl: toNumber(row.pnl)
    })).filter((row) => row.proxyWallet);
  }

  async activity(params: {
    user: string;
    limit?: number;
    offset?: number;
    type?: "TRADE" | "SPLIT" | "MERGE" | "REDEEM" | "REWARD" | "CONVERSION" | "MAKER_REBATE" | "REFERRAL_REWARD";
    side?: "BUY" | "SELL";
    start?: number;
    end?: number;
  }): Promise<UserActivity[]> {
    const url = new URL("/activity", this.baseUrl);
    url.searchParams.set("user", params.user);
    url.searchParams.set("limit", String(params.limit ?? 100));
    url.searchParams.set("offset", String(params.offset ?? 0));
    if (params.type) url.searchParams.set("type", params.type);
    if (params.side) url.searchParams.set("side", params.side);
    if (params.start !== undefined) url.searchParams.set("start", String(params.start));
    if (params.end !== undefined) url.searchParams.set("end", String(params.end));

    const rows = await fetchJson<RawUserActivity[]>(url.toString());
    return rows.map((row) => ({
      ...row,
      proxyWallet: String(row.proxyWallet ?? params.user),
      timestamp: toNumber(row.timestamp),
      size: toNumber(row.size),
      usdcSize: toNumber(row.usdcSize),
      price: toNumber(row.price)
    }));
  }

  async positions(params: { user: string; limit?: number; offset?: number }): Promise<UserPosition[]> {
    const url = new URL("/positions", this.baseUrl);
    url.searchParams.set("user", params.user);
    url.searchParams.set("limit", String(params.limit ?? 100));
    url.searchParams.set("offset", String(params.offset ?? 0));

    const rows = await fetchJson<RawUserPosition[]>(url.toString());
    return rows.map((row) => ({
      ...row,
      proxyWallet: String(row.proxyWallet ?? params.user),
      size: toNumber(row.size),
      avgPrice: toNumber(row.avgPrice),
      initialValue: toNumber(row.initialValue),
      currentValue: toNumber(row.currentValue),
      cashPnl: toNumber(row.cashPnl),
      percentPnl: toNumber(row.percentPnl),
      realizedPnl: toNumber(row.realizedPnl),
      curPrice: toNumber(row.curPrice)
    }));
  }
}
