import { config } from "../config.js";
import { fetchJson, toNumber } from "../utils/http.js";

type AggTrade = {
  p: string;
  q: string;
  T: number;
};

type TickerPrice = {
  price: string;
};

export interface SpotPoint {
  timeMs: number;
  price: number;
}

export class BinanceClient {
  constructor(private readonly baseUrl = config.binanceApiBase) {}

  async aggTrades(symbol: string, startTime: number, endTime: number, limit = 1000): Promise<SpotPoint[]> {
    const url = new URL("/api/v3/aggTrades", this.baseUrl);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("startTime", String(startTime));
    url.searchParams.set("endTime", String(endTime));
    url.searchParams.set("limit", String(limit));

    const rows = await fetchJson<AggTrade[]>(url.toString());
    return rows.map((row) => ({
      timeMs: row.T,
      price: toNumber(row.p)
    })).filter((row) => row.price > 0);
  }

  async nearestPrice(symbol: string, timeMs: number, windowMs = 30_000): Promise<SpotPoint | undefined> {
    const points = await this.aggTrades(symbol, timeMs - windowMs, timeMs + windowMs, 1000);
    return points.sort((a, b) => Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs))[0];
  }

  async tickerPrice(symbol: string): Promise<SpotPoint | undefined> {
    const url = new URL("/api/v3/ticker/price", this.baseUrl);
    url.searchParams.set("symbol", symbol);
    const row = await fetchJson<TickerPrice>(url.toString());
    const price = toNumber(row.price);
    return price > 0 ? { timeMs: Date.now(), price } : undefined;
  }
}
