import fs from "node:fs";
import path from "node:path";
import { BinanceClient, SpotPoint } from "../adapters/binanceClient.js";
import { ClobClient, TokenQuote } from "../polymarket/clobClient.js";
import { GammaClient } from "../polymarket/gammaClient.js";
import { MarketSummary } from "../types.js";
import { generateExhaustionSignal, namedExhaustionSetups } from "../strategies/exhaustionReversal/index.js";
import {
  BtcPricePoint,
  ExhaustionBacktestDataset,
  PolymarketOddsSnapshot,
  UpDownMarketWindow
} from "../strategies/exhaustionReversal/types.js";

type Outcome = "UP" | "DOWN";

export interface ExhaustionCollectorOptions {
  seconds: number;
  pollSecs: number;
  outputDir: string;
  symbol: string;
  asset: string;
  includeSignals: boolean;
}

export interface ExhaustionCollectorReport {
  startedAt: string;
  endedAt: string;
  observations: number;
  markets: number;
  oddsSnapshots: number;
  btcPriceSnapshots: number;
  signalSnapshots: number;
  outputDir: string;
  datasetFile: string;
}

export class ExhaustionReversalCollector {
  private readonly gamma = new GammaClient();
  private readonly clob = new ClobClient();
  private readonly binance = new BinanceClient();
  private readonly markets = new Map<string, UpDownMarketWindow>();
  private readonly btcPrices: BtcPricePoint[] = [];
  private readonly odds: PolymarketOddsSnapshot[] = [];
  private readonly beatCache = new Map<string, SpotPoint | undefined>();

  async run(options: ExhaustionCollectorOptions): Promise<ExhaustionCollectorReport> {
    fs.mkdirSync(options.outputDir, { recursive: true });
    const startedAt = new Date();
    const marketFile = path.join(options.outputDir, "markets.jsonl");
    const btcFile = path.join(options.outputDir, "btc_prices.jsonl");
    const oddsFile = path.join(options.outputDir, "odds.jsonl");
    const signalsFile = path.join(options.outputDir, "signals.jsonl");
    const datasetFile = path.join(options.outputDir, "dataset.json");
    const params = namedExhaustionSetups();
    let observations = 0;
    let signalSnapshots = 0;

    while (Date.now() - startedAt.getTime() < options.seconds * 1000) {
      const now = new Date().toISOString();
      const markets = await this.findCurrentMarkets(options.asset);
      const btc = await this.binance.tickerPrice(options.symbol);
      if (btc) {
        const btcPoint: BtcPricePoint = { ...btc, source: "binance" };
        this.btcPrices.push(btcPoint);
        appendJsonl(btcFile, btcPoint);
      }

      for (const market of markets) {
        observations++;
        const window = await this.toWindow(market, options.symbol);
        if (!window) continue;
        this.markets.set(window.marketId, window);
        appendJsonl(marketFile, { observedAt: now, ...window });

        const [upToken, downToken] = tokenPairForUpDown(market);
        if (!upToken || !downToken) continue;
        const [up, down] = await Promise.all([
          this.clob.getTokenQuote(upToken).catch(() => undefined),
          this.clob.getTokenQuote(downToken).catch(() => undefined)
        ]);
        if (!up || !down) continue;
        const oddsSnapshot = oddsFromQuotes(window.marketId, Date.now(), up, down);
        this.odds.push(oddsSnapshot);
        appendJsonl(oddsFile, oddsSnapshot);

        if (options.includeSignals && btc) {
          for (const paramSet of params) {
            const signal = generateExhaustionSignal({
              market: window,
              now: { ...btc, source: "binance" },
              priceHistory: this.btcPrices,
              odds: oddsSnapshot,
              params: paramSet
            });
            if (signal.shouldEnter || signal.reason !== "z_below_threshold") {
              signalSnapshots++;
              appendJsonl(signalsFile, {
                observedAt: now,
                parameterName: paramSet.name,
                marketId: window.marketId,
                slug: window.slug,
                shouldEnter: signal.shouldEnter,
                sideToBuy: signal.sideToBuy,
                entryAsk: signal.entryAsk,
                reason: signal.reason,
                confidenceScore: signal.confidenceScore,
                dataQuality: signal.dataQuality,
                metrics: signal.metrics
              });
            }
          }
        }
      }

      await this.writeDataset(datasetFile);
      console.log(`[${now}] markets=${markets.length} observations=${observations} btc=${this.btcPrices.length} odds=${this.odds.length} signals=${signalSnapshots}`);
      await sleep(options.pollSecs * 1000);
    }

    await this.writeDataset(datasetFile);
    return {
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      observations,
      markets: this.markets.size,
      oddsSnapshots: this.odds.length,
      btcPriceSnapshots: this.btcPrices.length,
      signalSnapshots,
      outputDir: options.outputDir,
      datasetFile
    };
  }

  private async findCurrentMarkets(asset: string): Promise<MarketSummary[]> {
    const slugs = current5mSlugs(asset);
    const batches = await Promise.all(slugs.map((slug) => this.gamma.fetchEventMarketsBySlug(slug).catch(() => [])));
    return dedupeMarkets(batches.flat()).filter((market) => market.tokenIds.length >= 2);
  }

  private async toWindow(market: MarketSummary, symbol: string): Promise<UpDownMarketWindow | undefined> {
    const window = windowFromSlug(market.slug);
    if (!window) return undefined;
    const key = market.marketId || market.slug;
    let beat = this.beatCache.get(key);
    if (!this.beatCache.has(key) && Date.now() >= window.startTimeMs) {
      beat = await this.binance.nearestPrice(symbol, window.startTimeMs, 20_000).catch(() => undefined);
      this.beatCache.set(key, beat);
    }
    const [upTokenId, downTokenId] = tokenPairForUpDown(market);
    const final = Date.now() > window.endTimeMs ? await this.binance.nearestPrice(symbol, window.endTimeMs, 20_000).catch(() => undefined) : undefined;
    const priceToBeat = beat?.price;
    if (priceToBeat === undefined) return undefined;
    const result: Outcome | undefined = final ? (final.price >= priceToBeat ? "UP" : "DOWN") : undefined;
    return {
      marketId: key,
      slug: market.slug,
      startTimeMs: window.startTimeMs,
      endTimeMs: window.endTimeMs,
      priceToBeat,
      result,
      upTokenId,
      downTokenId
    };
  }

  private async writeDataset(file: string): Promise<void> {
    const dataset: ExhaustionBacktestDataset = {
      markets: [...this.markets.values()],
      btcPrices: this.btcPrices,
      odds: this.odds
    };
    await fs.promises.writeFile(file, JSON.stringify(dataset, null, 2));
  }
}

function current5mSlugs(asset: string): string[] {
  const base = Math.floor(Date.now() / 300_000) * 300;
  return [-1, 0, 1].map((offset) => `${asset.toLowerCase()}-updown-5m-${base + offset * 300}`);
}

function windowFromSlug(slug: string): { startTimeMs: number; endTimeMs: number } | undefined {
  const match = slug.match(/^(?:btc)-updown-5m-(\d{10})$/i);
  if (!match) return undefined;
  const startTimeMs = Number(match[1]) * 1000;
  return { startTimeMs, endTimeMs: startTimeMs + 300_000 };
}

function tokenPairForUpDown(market: MarketSummary): [string | undefined, string | undefined] {
  const upIndex = market.outcomes.findIndex((outcome) => /^up$|^yes$/i.test(outcome));
  const downIndex = market.outcomes.findIndex((outcome) => /^down$|^no$/i.test(outcome));
  return [market.tokenIds[upIndex >= 0 ? upIndex : 0], market.tokenIds[downIndex >= 0 ? downIndex : 1]];
}

function oddsFromQuotes(marketId: string, timeMs: number, up: TokenQuote, down: TokenQuote): PolymarketOddsSnapshot {
  return {
    marketId,
    timeMs,
    upBid: up.bestBid,
    upAsk: up.bestAsk,
    downBid: down.bestBid,
    downAsk: down.bestAsk,
    upAskSize: up.bestAskSize,
    downAskSize: down.bestAskSize,
    upTopLiquidity: up.topLiquidity,
    downTopLiquidity: down.topLiquidity,
    source: "book"
  };
}

function appendJsonl(file: string, row: unknown): void {
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}

function dedupeMarkets(markets: MarketSummary[]): MarketSummary[] {
  const byKey = new Map<string, MarketSummary>();
  for (const market of markets) byKey.set(market.marketId || market.slug, market);
  return [...byKey.values()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
