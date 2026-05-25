import fs from "node:fs";
import path from "node:path";
import { BinanceClient, SpotPoint } from "../adapters/binanceClient.js";
import { ClobClient, TokenQuote } from "../polymarket/clobClient.js";
import { GammaClient } from "../polymarket/gammaClient.js";
import { MarketSummary } from "../types.js";

type Outcome = "Up" | "Down";

export interface EarlyLeaderInversionOptions {
  seconds: number;
  pollSecs: number;
  stake: number;
  minEarlyLeaderBid: number;
  minNewLeaderBid: number;
  maxNewLeaderBid: number;
  minFlipGap: number;
  maxEntryAsk: number;
  minSecondsToEnd: number;
  maxSecondsToEnd: number;
  takeProfitBid: number;
  stopBid: number;
  exitSecondsToEnd: number;
  assets: string[];
  minAbsDistanceToBeatBps: number;
  maxAbsDistanceToBeatBps: number;
  minRecentVolatilityBps: number;
  maxRecentVolatilityBps: number;
  logFile: string;
}

export interface EarlyLeaderInversionReport {
  startedAt: string;
  endedAt: string;
  markets: number;
  observations: number;
  entries: number;
  exits: number;
  stake: number;
  pnl: number;
  logFile: string;
}

interface ElSample {
  secondsToEnd: number;
  upBid?: number;
  downBid?: number;
}

interface ElContext {
  status: "warming" | "ready";
  leader?: Outcome;
  bid240?: number;
  newLeader?: Outcome;
  oldLeaderBid?: number;
  newLeaderBid?: number;
}

interface OpenTrade {
  market: MarketSummary;
  outcome: Outcome;
  entryAsk: number;
  shares: number;
  stake: number;
  openedAt: string;
  spot?: SpotContext;
}

interface SpotContext {
  asset: string;
  symbol: string;
  spotPrice?: number;
  priceToBeat?: number;
  distanceToBeatUsd?: number;
  distanceToBeatBps?: number;
  directionFromBeat?: "Up" | "Down" | "Flat";
  recentMoveBps?: number;
  recentVolatilityBps?: number;
  recentDirection?: "Up" | "Down" | "Flat";
  recentSamples: number;
}

export class EarlyLeaderInversionPaperService {
  private readonly gamma = new GammaClient();
  private readonly clob = new ClobClient();
  private readonly binance = new BinanceClient();
  private readonly samples = new Map<string, ElSample[]>();
  private readonly spotSamples = new Map<string, SpotPoint[]>();
  private readonly priceToBeat = new Map<string, SpotPoint | undefined>();

  async run(options: EarlyLeaderInversionOptions): Promise<EarlyLeaderInversionReport> {
    ensureDir(options.logFile);
    const startedAt = new Date();
    let markets = await this.findMarkets(options.assets);
    let nextRefreshAt = 0;
    const open = new Map<string, OpenTrade>();
    const done = new Set<string>();
    let observations = 0;
    let entries = 0;
    let exits = 0;
    let stake = 0;
    let pnl = 0;

    while (Date.now() - startedAt.getTime() < options.seconds * 1000) {
      if (Date.now() >= nextRefreshAt) {
        markets = await this.findMarkets(options.assets);
        nextRefreshAt = Date.now() + 30_000;
      }
      const rows = await Promise.all(markets.map((market) => this.quoteMarket(market).catch((error) => ({ market, error }))));
      const now = new Date().toISOString();
      for (const row of rows) {
        if ("error" in row) {
          appendJsonl(options.logFile, {
            type: "SKIP",
            observedAt: now,
            marketId: row.market.marketId,
            slug: row.market.slug,
            title: row.market.title,
            reason: row.error instanceof Error ? row.error.message : String(row.error)
          });
          continue;
        }

        observations++;
        const { market, up, down } = row;
        const key = market.marketId || market.slug;
        const secs = secondsToEnd(market);
        const ctx = this.updateContext(market, up, down);
        const spot = await this.spotContext(market).catch(() => undefined);
        const existing = open.get(key);

        if (existing) {
          const quote = existing.outcome === "Up" ? up : down;
          const exitBid = quote.bestBid;
          const shouldExit =
            exitBid !== undefined &&
            (exitBid >= options.takeProfitBid || exitBid <= options.stopBid || (secs !== undefined && secs <= options.exitSecondsToEnd));
          if (shouldExit && exitBid !== undefined) {
            const tradePnl = existing.shares * exitBid - existing.stake;
            pnl += tradePnl;
            exits++;
            open.delete(key);
            done.add(key);
            appendJsonl(options.logFile, {
              type: "EXIT",
              observedAt: now,
              marketId: market.marketId,
              slug: market.slug,
              title: market.title,
              outcome: existing.outcome,
              entryAsk: existing.entryAsk,
              exitBid,
              stake: existing.stake,
              shares: existing.shares,
              pnl: tradePnl,
              secondsToEnd: secs,
              reason: exitBid >= options.takeProfitBid ? "take_profit" : exitBid <= options.stopBid ? "stop" : "near_end",
              ...ctxFields(ctx),
              ...spotFields(spot),
              entrySpotPrice: existing.spot?.spotPrice,
              entryDistanceToBeatUsd: existing.spot?.distanceToBeatUsd,
              entryDistanceToBeatBps: existing.spot?.distanceToBeatBps,
              entryRecentMoveBps: existing.spot?.recentMoveBps,
              entryRecentVolatilityBps: existing.spot?.recentVolatilityBps
            });
          }
          continue;
        }

        if (done.has(key)) continue;
        const signal = evaluateInversionSignal(ctx, up, down, secs, spot, options);
        if (!signal.ok) {
          if (signal.loggable) {
            appendJsonl(options.logFile, {
              type: "SKIP",
              observedAt: now,
              marketId: market.marketId,
              slug: market.slug,
              title: market.title,
              secondsToEnd: secs,
              reason: signal.reason,
              ...ctxFields(ctx),
              ...spotFields(spot)
            });
          }
          continue;
        }

        const entryQuote = signal.outcome === "Up" ? up : down;
        const entryAsk = entryQuote.bestAsk;
        if (entryAsk === undefined) continue;
        const tradeStake = Math.min(options.stake, entryAsk * (entryQuote.bestAskSize ?? 0));
        if (tradeStake <= 0) continue;
        const shares = tradeStake / entryAsk;
        entries++;
        stake += tradeStake;
        open.set(key, {
          market,
          outcome: signal.outcome,
          entryAsk,
          shares,
          stake: tradeStake,
          openedAt: now,
          spot
        });
        appendJsonl(options.logFile, {
          type: "ENTRY",
          observedAt: now,
          marketId: market.marketId,
          slug: market.slug,
          title: market.title,
          outcome: signal.outcome,
          entryAsk,
          stake: tradeStake,
          shares,
          secondsToEnd: secs,
          ...ctxFields(ctx),
          ...spotFields(spot)
        });
      }
      await sleep(options.pollSecs * 1000);
    }

    return {
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      markets: markets.length,
      observations,
      entries,
      exits,
      stake,
      pnl,
      logFile: options.logFile
    };
  }

  private updateContext(market: MarketSummary, up: TokenQuote, down: TokenQuote): ElContext {
    const secs = secondsToEnd(market);
    const key = market.marketId || market.slug;
    if (secs === undefined) return { status: "warming" };
    const rows = this.samples.get(key) ?? [];
    rows.push({ secondsToEnd: secs, upBid: up.bestBid, downBid: down.bestBid });
    this.samples.set(key, rows.filter((row) => row.secondsToEnd >= 90 && row.secondsToEnd <= 250));

    const detect = rows.filter((row) => row.secondsToEnd <= 240 && row.secondsToEnd >= 181);
    if (detect.length < 2) return { status: "warming" };
    const up240 = avgDefined(detect.map((row) => row.upBid));
    const down240 = avgDefined(detect.map((row) => row.downBid));
    if (up240 === undefined && down240 === undefined) return { status: "warming" };
    const leader: Outcome = (up240 ?? 0) >= (down240 ?? 0) ? "Up" : "Down";
    const bid240 = leader === "Up" ? up240 : down240;
    if (bid240 === undefined) return { status: "warming" };
    const newLeader: Outcome = leader === "Up" ? "Down" : "Up";
    return {
      status: "ready",
      leader,
      bid240,
      newLeader,
      oldLeaderBid: leader === "Up" ? up.bestBid : down.bestBid,
      newLeaderBid: newLeader === "Up" ? up.bestBid : down.bestBid
    };
  }

  private async findMarkets(assets: string[]): Promise<MarketSummary[]> {
    const slugs = current5mSlugs(assets);
    const batches = await Promise.all(slugs.map((slug) => this.gamma.fetchEventMarketsBySlug(slug).catch(() => [])));
    return dedupeMarkets(batches.flat()).filter((market) => {
      const secs = secondsToEnd(market);
      return market.tokenIds.length >= 2 && secs !== undefined && secs > 0 && secs <= 600;
    });
  }

  private async quoteMarket(market: MarketSummary): Promise<{ market: MarketSummary; up: TokenQuote; down: TokenQuote }> {
    const [upToken, downToken] = tokenPairForUpDown(market);
    if (!upToken || !downToken) throw new Error(`Missing token pair for ${market.slug}`);
    const [up, down] = await Promise.all([this.clob.getTokenQuote(upToken), this.clob.getTokenQuote(downToken)]);
    return { market, up, down };
  }

  private async spotContext(market: MarketSummary): Promise<SpotContext | undefined> {
    const asset = assetFromSlug(market.slug);
    const window = windowFromSlug(market.slug);
    if (!asset || !window) return undefined;
    const symbol = `${asset.toUpperCase()}USDT`;
    const key = market.marketId || market.slug;
    const current = await this.binance.tickerPrice(symbol);
    const rows = this.spotSamples.get(key) ?? [];
    if (current) rows.push(current);
    const recent = rows.filter((row) => row.timeMs >= Date.now() - 60_000);
    this.spotSamples.set(key, recent);
    let beat = this.priceToBeat.get(key);
    if (!beat && Date.now() >= window.startMs) {
      beat = await this.binance.nearestPrice(symbol, window.startMs, 20_000).catch(() => undefined);
      if (beat) this.priceToBeat.set(key, beat);
    }
    if (!beat && recent[0]) {
      beat = recent[0];
    }
    const spotPrice = current?.price;
    const priceToBeat = beat?.price;
    const firstRecent = recent[0]?.price;
    const recentMoveBps = firstRecent && spotPrice ? ((spotPrice - firstRecent) / firstRecent) * 10_000 : undefined;
    return {
      asset: asset.toUpperCase(),
      symbol,
      spotPrice,
      priceToBeat,
      distanceToBeatUsd: spotPrice !== undefined && priceToBeat !== undefined ? spotPrice - priceToBeat : undefined,
      distanceToBeatBps: spotPrice !== undefined && priceToBeat !== undefined ? ((spotPrice - priceToBeat) / priceToBeat) * 10_000 : undefined,
      directionFromBeat: direction(spotPrice, priceToBeat),
      recentMoveBps,
      recentVolatilityBps: volatilityBps(recent.map((row) => row.price)),
      recentDirection: direction(spotPrice, firstRecent),
      recentSamples: recent.length
    };
  }
}

function evaluateInversionSignal(
  ctx: ElContext,
  up: TokenQuote,
  down: TokenQuote,
  secs: number | undefined,
  spot: SpotContext | undefined,
  options: EarlyLeaderInversionOptions
): { ok: true; outcome: Outcome } | { ok: false; reason: string; loggable: boolean } {
  if (ctx.status !== "ready" || !ctx.newLeader) return { ok: false, reason: "early_leader_warming", loggable: false };
  if ((ctx.bid240 ?? 0) < options.minEarlyLeaderBid) return { ok: false, reason: "weak_early_leader", loggable: false };
  if (secs === undefined || secs < options.minSecondsToEnd || secs > options.maxSecondsToEnd) {
    return { ok: false, reason: "outside_time_window", loggable: false };
  }
  const quote = ctx.newLeader === "Up" ? up : down;
  const entryAsk = quote.bestAsk;
  if (ctx.newLeaderBid === undefined || ctx.oldLeaderBid === undefined || entryAsk === undefined) {
    return { ok: false, reason: "missing_quote", loggable: false };
  }
  const bidOk = ctx.newLeaderBid >= options.minNewLeaderBid && ctx.newLeaderBid <= options.maxNewLeaderBid;
  const flipped = ctx.newLeaderBid >= ctx.oldLeaderBid + options.minFlipGap;
  const askOk = entryAsk <= options.maxEntryAsk;
  if (!bidOk || !flipped || !askOk) {
    return { ok: false, reason: `no_inversion bid=${ctx.newLeaderBid.toFixed(3)} old=${ctx.oldLeaderBid.toFixed(3)} ask=${entryAsk.toFixed(3)}`, loggable: true };
  }
  const absDistance = Math.abs(spot?.distanceToBeatBps ?? Number.NaN);
  if (Number.isFinite(options.minAbsDistanceToBeatBps) && absDistance < options.minAbsDistanceToBeatBps) {
    return { ok: false, reason: `distance_too_small absDistanceBps=${absDistance.toFixed(3)}`, loggable: true };
  }
  if (Number.isFinite(options.maxAbsDistanceToBeatBps) && absDistance > options.maxAbsDistanceToBeatBps) {
    return { ok: false, reason: `distance_too_large absDistanceBps=${absDistance.toFixed(3)}`, loggable: true };
  }
  const volatility = spot?.recentVolatilityBps;
  if (volatility === undefined || volatility < options.minRecentVolatilityBps || volatility > options.maxRecentVolatilityBps) {
    return { ok: false, reason: `volatility_outside value=${volatility?.toFixed(3) ?? "missing"}`, loggable: true };
  }
  return { ok: true, outcome: ctx.newLeader };
}

function ctxFields(ctx: ElContext): Record<string, unknown> {
  return {
    elLeader: ctx.leader,
    elBid240: ctx.bid240,
    newLeader: ctx.newLeader,
    oldLeaderBid: ctx.oldLeaderBid,
    newLeaderBid: ctx.newLeaderBid
  };
}

function spotFields(spot: SpotContext | undefined): Record<string, unknown> {
  if (!spot) return {};
  return {
    asset: spot.asset,
    spotSymbol: spot.symbol,
    spotPrice: spot.spotPrice,
    priceToBeat: spot.priceToBeat,
    distanceToBeatUsd: spot.distanceToBeatUsd,
    distanceToBeatBps: spot.distanceToBeatBps,
    directionFromBeat: spot.directionFromBeat,
    recentMoveBps: spot.recentMoveBps,
    recentVolatilityBps: spot.recentVolatilityBps,
    recentDirection: spot.recentDirection,
    recentSamples: spot.recentSamples
  };
}

function current5mSlugs(assets: string[]): string[] {
  const base = Math.floor(Date.now() / 300_000) * 300;
  const out = new Set<string>();
  for (const asset of assets) {
    for (const offset of [-1, 0, 1]) out.add(`${asset}-updown-5m-${base + offset * 300}`);
  }
  return [...out];
}

function tokenPairForUpDown(market: MarketSummary): [string | undefined, string | undefined] {
  const upIndex = market.outcomes.findIndex((outcome) => /^up$|^yes$/i.test(outcome));
  const downIndex = market.outcomes.findIndex((outcome) => /^down$|^no$/i.test(outcome));
  return [market.tokenIds[upIndex >= 0 ? upIndex : 0], market.tokenIds[downIndex >= 0 ? downIndex : 1]];
}

function secondsToEnd(market: MarketSummary): number | undefined {
  const match = market.slug.match(/(?:btc|eth|sol|xrp|doge|bnb)-updown-5m-(\d{10})/i);
  if (!match) return undefined;
  return (Number(match[1]) * 1000 + 300_000 - Date.now()) / 1000;
}

function assetFromSlug(slug: string): string | undefined {
  return slug.match(/^(btc|eth|sol|xrp|doge|bnb)-updown-5m-\d{10}$/i)?.[1]?.toLowerCase();
}

function windowFromSlug(slug: string): { startMs: number; endMs: number } | undefined {
  const match = slug.match(/^(?:btc|eth|sol|xrp|doge|bnb)-updown-5m-(\d{10})$/i);
  if (!match) return undefined;
  const startMs = Number(match[1]) * 1000;
  return { startMs, endMs: startMs + 300_000 };
}

function direction(current: number | undefined, reference: number | undefined): "Up" | "Down" | "Flat" | undefined {
  if (current === undefined || reference === undefined) return undefined;
  const diff = current - reference;
  if (Math.abs(diff / reference) * 10_000 < 0.5) return "Flat";
  return diff > 0 ? "Up" : "Down";
}

function volatilityBps(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const returns = values.slice(1).map((value, index) => ((value - values[index]) / values[index]) * 10_000);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  return Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length);
}

function dedupeMarkets(markets: MarketSummary[]): MarketSummary[] {
  const byKey = new Map<string, MarketSummary>();
  for (const market of markets) byKey.set(market.marketId || market.slug, market);
  return [...byKey.values()];
}

function ensureDir(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function appendJsonl(file: string, row: unknown): void {
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function avgDefined(values: Array<number | undefined>): number | undefined {
  const nums = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : undefined;
}
