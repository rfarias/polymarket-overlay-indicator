import fs from "node:fs";
import path from "node:path";
import { BinanceClient, CandlePoint, SpotPoint } from "../adapters/binanceClient.js";
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
  observeOnly: boolean;
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
  newLeaderStablePolls?: number;
  newLeaderStableSeconds?: number;
  newLeaderBidMove5s?: number;
  newLeaderBidMove10s?: number;
  oldLeaderBidMove5s?: number;
  oldLeaderBidMove10s?: number;
  flipGap?: number;
  flipGapMove5s?: number;
  flipGapMove10s?: number;
}

interface OpenTrade {
  market: MarketSummary;
  outcome: Outcome;
  entryAsk: number;
  entryBestAskSize?: number;
  entryBestBid?: number;
  entryBestBidSize?: number;
  entrySpread?: number;
  entryTopLiquidity: number;
  requestedStake: number;
  fillRatio: number;
  shares: number;
  stake: number;
  openedAt: string;
  openedAtMs: number;
  entrySecondsFromStart?: number;
  entrySecondsToEnd?: number;
  spot?: SpotContext;
  bestBidSeen?: number;
  worstBidSeen?: number;
  maxPnlSeen?: number;
  minPnlSeen?: number;
  bestBidSeenAt?: string;
  worstBidSeenAt?: string;
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
  spotMoveBps10s?: number;
  spotMoveBps30s?: number;
  spotMoveBps60s?: number;
  spotMoveBps120s?: number;
  spotVolatilityBps10s?: number;
  spotVolatilityBps30s?: number;
  spotVolatilityBps60s?: number;
  spotVolatilityBps120s?: number;
  beatCrosses60s?: number;
  beatCrosses120s?: number;
  secondsSinceBeatCross?: number;
  directionStableSeconds?: number;
  directionStableSamples?: number;
  candle1mBodyBps?: number;
  candle1mRangeBps?: number;
  candle1mVolume?: number;
  candle1mClosePosition?: number;
  candle5mBodyBps?: number;
  candle5mRangeBps?: number;
  candle5mVolume?: number;
  candle5mClosePosition?: number;
  btcMoveBps60s?: number;
  btcMoveBps300s?: number;
  ethMoveBps60s?: number;
  ethMoveBps300s?: number;
  assetVsBtcMoveBps60s?: number;
  assetVsEthMoveBps60s?: number;
  assetVsBtcMoveBps300s?: number;
  assetVsEthMoveBps300s?: number;
}

interface InversionSample {
  timeMs: number;
  newLeaderBid?: number;
  oldLeaderBid?: number;
  flipGap?: number;
  newLeader?: Outcome;
}

export class EarlyLeaderInversionPaperService {
  private readonly gamma = new GammaClient();
  private readonly clob = new ClobClient();
  private readonly binance = new BinanceClient();
  private readonly samples = new Map<string, ElSample[]>();
  private readonly spotSamples = new Map<string, SpotPoint[]>();
  private readonly macroSpotSamples = new Map<string, SpotPoint[]>();
  private readonly inversionSamples = new Map<string, InversionSample[]>();
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
          this.updateOpenTradeExcursion(existing, exitBid, now);
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
              exitBestBidSize: quote.bestBidSize,
              exitBestAsk: quote.bestAsk,
              exitBestAskSize: quote.bestAskSize,
              exitSpread: quote.spread,
              exitTopLiquidity: quote.topLiquidity,
              stake: existing.stake,
              requestedStake: existing.requestedStake,
              fillRatio: existing.fillRatio,
              shares: existing.shares,
              pnl: tradePnl,
              secondsToEnd: secs,
              entrySecondsToEnd: existing.entrySecondsToEnd,
              entrySecondsFromStart: existing.entrySecondsFromStart,
              exitSecondsToEnd: secs,
              exitSecondsFromStart: secondsFromStart(market),
              holdSeconds: (Date.parse(now) - existing.openedAtMs) / 1000,
              reason: exitBid >= options.takeProfitBid ? "take_profit" : exitBid <= options.stopBid ? "stop" : "near_end",
              entryBestAskSize: existing.entryBestAskSize,
              entryBestBid: existing.entryBestBid,
              entryBestBidSize: existing.entryBestBidSize,
              entrySpread: existing.entrySpread,
              entryTopLiquidity: existing.entryTopLiquidity,
              bestBidSeen: existing.bestBidSeen,
              worstBidSeen: existing.worstBidSeen,
              maxPnlSeen: existing.maxPnlSeen,
              minPnlSeen: existing.minPnlSeen,
              bestBidSeenAt: existing.bestBidSeenAt,
              worstBidSeenAt: existing.worstBidSeenAt,
              ...ctxFields(ctx),
              ...spotFields(spot),
              entrySpotPrice: existing.spot?.spotPrice,
              entryDistanceToBeatUsd: existing.spot?.distanceToBeatUsd,
              entryDistanceToBeatBps: existing.spot?.distanceToBeatBps,
              entryRecentMoveBps: existing.spot?.recentMoveBps,
              entryRecentVolatilityBps: existing.spot?.recentVolatilityBps,
              entrySpotMoveBps10s: existing.spot?.spotMoveBps10s,
              entrySpotMoveBps30s: existing.spot?.spotMoveBps30s,
              entrySpotMoveBps60s: existing.spot?.spotMoveBps60s,
              entrySpotMoveBps120s: existing.spot?.spotMoveBps120s,
              entryBeatCrosses60s: existing.spot?.beatCrosses60s,
              entryBeatCrosses120s: existing.spot?.beatCrosses120s,
              entrySecondsSinceBeatCross: existing.spot?.secondsSinceBeatCross,
              entryDirectionStableSeconds: existing.spot?.directionStableSeconds,
              entryCandle1mBodyBps: existing.spot?.candle1mBodyBps,
              entryCandle1mRangeBps: existing.spot?.candle1mRangeBps,
              entryCandle5mBodyBps: existing.spot?.candle5mBodyBps,
              entryCandle5mRangeBps: existing.spot?.candle5mRangeBps,
              entryBtcMoveBps60s: existing.spot?.btcMoveBps60s,
              entryEthMoveBps60s: existing.spot?.ethMoveBps60s,
              entryAssetVsBtcMoveBps60s: existing.spot?.assetVsBtcMoveBps60s,
              entryAssetVsEthMoveBps60s: existing.spot?.assetVsEthMoveBps60s
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
        if (options.observeOnly) {
          appendJsonl(options.logFile, {
            type: "SIGNAL",
            observedAt: now,
            marketId: market.marketId,
            slug: market.slug,
            title: market.title,
            outcome: signal.outcome,
            entryAsk,
            entryBestAskSize: entryQuote.bestAskSize,
            entryBestBid: entryQuote.bestBid,
            entryBestBidSize: entryQuote.bestBidSize,
            entrySpread: entryQuote.spread,
            entryTopLiquidity: entryQuote.topLiquidity,
            secondsToEnd: secs,
            entrySecondsToEnd: secs,
            entrySecondsFromStart: secondsFromStart(market),
            ...ctxFields(ctx),
            ...spotFields(spot)
          });
          done.add(key);
          continue;
        }

        const requestedStake = options.stake;
        const tradeStake = Math.min(requestedStake, entryAsk * (entryQuote.bestAskSize ?? 0));
        if (tradeStake <= 0) continue;
        const shares = tradeStake / entryAsk;
        const fillRatio = requestedStake > 0 ? tradeStake / requestedStake : 0;
        entries++;
        stake += tradeStake;
        open.set(key, {
          market,
          outcome: signal.outcome,
          entryAsk,
          entryBestAskSize: entryQuote.bestAskSize,
          entryBestBid: entryQuote.bestBid,
          entryBestBidSize: entryQuote.bestBidSize,
          entrySpread: entryQuote.spread,
          entryTopLiquidity: entryQuote.topLiquidity,
          requestedStake,
          fillRatio,
          shares,
          stake: tradeStake,
          openedAt: now,
          openedAtMs: Date.parse(now),
          entrySecondsFromStart: secondsFromStart(market),
          entrySecondsToEnd: secs,
          spot,
          bestBidSeen: entryQuote.bestBid,
          worstBidSeen: entryQuote.bestBid,
          maxPnlSeen: entryQuote.bestBid !== undefined ? shares * entryQuote.bestBid - tradeStake : undefined,
          minPnlSeen: entryQuote.bestBid !== undefined ? shares * entryQuote.bestBid - tradeStake : undefined,
          bestBidSeenAt: entryQuote.bestBid !== undefined ? now : undefined,
          worstBidSeenAt: entryQuote.bestBid !== undefined ? now : undefined
        });
        appendJsonl(options.logFile, {
          type: "ENTRY",
          observedAt: now,
          marketId: market.marketId,
          slug: market.slug,
          title: market.title,
          outcome: signal.outcome,
          entryAsk,
          entryBestAskSize: entryQuote.bestAskSize,
          entryBestBid: entryQuote.bestBid,
          entryBestBidSize: entryQuote.bestBidSize,
          entrySpread: entryQuote.spread,
          entryTopLiquidity: entryQuote.topLiquidity,
          stake: tradeStake,
          requestedStake,
          fillRatio,
          shares,
          secondsToEnd: secs,
          entrySecondsToEnd: secs,
          entrySecondsFromStart: secondsFromStart(market),
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
    const ctx: ElContext = {
      status: "ready",
      leader,
      bid240,
      newLeader,
      oldLeaderBid: leader === "Up" ? up.bestBid : down.bestBid,
      newLeaderBid: newLeader === "Up" ? up.bestBid : down.bestBid
    };
    return { ...ctx, ...this.updateInversionContext(key, ctx) };
  }

  private updateInversionContext(key: string, ctx: ElContext): Partial<ElContext> {
    const now = Date.now();
    const flipGap = ctx.newLeaderBid !== undefined && ctx.oldLeaderBid !== undefined ? ctx.newLeaderBid - ctx.oldLeaderBid : undefined;
    const rows = this.inversionSamples.get(key) ?? [];
    rows.push({
      timeMs: now,
      newLeader: ctx.newLeader,
      newLeaderBid: ctx.newLeaderBid,
      oldLeaderBid: ctx.oldLeaderBid,
      flipGap
    });
    const recent = rows.filter((row) => row.timeMs >= now - 30_000);
    this.inversionSamples.set(key, recent);
    let stablePolls = 0;
    let stableSince = now;
    for (let index = recent.length - 1; index >= 0; index--) {
      if (recent[index]?.newLeader !== ctx.newLeader) break;
      stablePolls++;
      stableSince = recent[index]?.timeMs ?? stableSince;
    }
    return {
      newLeaderStablePolls: stablePolls,
      newLeaderStableSeconds: (now - stableSince) / 1000,
      newLeaderBidMove5s: valueMove(recent, "newLeaderBid", 5_000),
      newLeaderBidMove10s: valueMove(recent, "newLeaderBid", 10_000),
      oldLeaderBidMove5s: valueMove(recent, "oldLeaderBid", 5_000),
      oldLeaderBidMove10s: valueMove(recent, "oldLeaderBid", 10_000),
      flipGap,
      flipGapMove5s: valueMove(recent, "flipGap", 5_000),
      flipGapMove10s: valueMove(recent, "flipGap", 10_000)
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

  private updateOpenTradeExcursion(trade: OpenTrade, bid: number | undefined, observedAt: string): void {
    if (bid === undefined) return;
    const tradePnl = trade.shares * bid - trade.stake;
    if (trade.bestBidSeen === undefined || bid > trade.bestBidSeen) {
      trade.bestBidSeen = bid;
      trade.bestBidSeenAt = observedAt;
    }
    if (trade.worstBidSeen === undefined || bid < trade.worstBidSeen) {
      trade.worstBidSeen = bid;
      trade.worstBidSeenAt = observedAt;
    }
    if (trade.maxPnlSeen === undefined || tradePnl > trade.maxPnlSeen) trade.maxPnlSeen = tradePnl;
    if (trade.minPnlSeen === undefined || tradePnl < trade.minPnlSeen) trade.minPnlSeen = tradePnl;
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
    const recent = rows.filter((row) => row.timeMs >= Date.now() - 360_000);
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
    const recent60 = recent.filter((row) => row.timeMs >= Date.now() - 60_000);
    const firstRecent = recent60[0]?.price;
    const recentMoveBps = firstRecent && spotPrice ? ((spotPrice - firstRecent) / firstRecent) * 10_000 : undefined;
    const [candle1m, candle5m, macro] = await Promise.all([
      this.currentCandle(symbol, "1m").catch(() => undefined),
      this.currentCandle(symbol, "5m").catch(() => undefined),
      this.macroContext(symbol).catch((): Pick<SpotContext, "btcMoveBps60s" | "btcMoveBps300s" | "ethMoveBps60s" | "ethMoveBps300s"> => ({}))
    ]);
    return {
      asset: asset.toUpperCase(),
      symbol,
      spotPrice,
      priceToBeat,
      distanceToBeatUsd: spotPrice !== undefined && priceToBeat !== undefined ? spotPrice - priceToBeat : undefined,
      distanceToBeatBps: spotPrice !== undefined && priceToBeat !== undefined ? ((spotPrice - priceToBeat) / priceToBeat) * 10_000 : undefined,
      directionFromBeat: direction(spotPrice, priceToBeat),
      recentMoveBps,
      recentVolatilityBps: volatilityBps(recent60.map((row) => row.price)),
      recentDirection: direction(spotPrice, firstRecent),
      recentSamples: recent60.length,
      spotMoveBps10s: moveBps(recent, 10_000),
      spotMoveBps30s: moveBps(recent, 30_000),
      spotMoveBps60s: moveBps(recent, 60_000),
      spotMoveBps120s: moveBps(recent, 120_000),
      spotVolatilityBps10s: volatilityForWindow(recent, 10_000),
      spotVolatilityBps30s: volatilityForWindow(recent, 30_000),
      spotVolatilityBps60s: volatilityForWindow(recent, 60_000),
      spotVolatilityBps120s: volatilityForWindow(recent, 120_000),
      beatCrosses60s: countBeatCrosses(recent, priceToBeat, 60_000),
      beatCrosses120s: countBeatCrosses(recent, priceToBeat, 120_000),
      secondsSinceBeatCross: secondsSinceBeatCross(recent, priceToBeat),
      directionStableSeconds: directionStableSeconds(recent, priceToBeat),
      directionStableSamples: directionStableSamples(recent, priceToBeat),
      ...candleFields("candle1m", candle1m),
      ...candleFields("candle5m", candle5m),
      ...macro,
      assetVsBtcMoveBps60s: spreadDiff(moveBps(recent, 60_000), macro.btcMoveBps60s),
      assetVsEthMoveBps60s: spreadDiff(moveBps(recent, 60_000), macro.ethMoveBps60s),
      assetVsBtcMoveBps300s: spreadDiff(moveBps(recent, 300_000), macro.btcMoveBps300s),
      assetVsEthMoveBps300s: spreadDiff(moveBps(recent, 300_000), macro.ethMoveBps300s)
    };
  }

  private async currentCandle(symbol: string, interval: "1m" | "5m"): Promise<CandlePoint | undefined> {
    const rows = await this.binance.recentKlines(symbol, interval, 2);
    return rows[rows.length - 1];
  }

  private async macroContext(assetSymbol: string): Promise<Pick<SpotContext, "btcMoveBps60s" | "btcMoveBps300s" | "ethMoveBps60s" | "ethMoveBps300s">> {
    const entries = await Promise.all(["BTCUSDT", "ETHUSDT"].map(async (symbol) => {
      const current = await this.binance.tickerPrice(symbol);
      const rows = this.macroSpotSamples.get(symbol) ?? [];
      if (current) rows.push(current);
      const recent = rows.filter((row) => row.timeMs >= Date.now() - 360_000);
      this.macroSpotSamples.set(symbol, recent);
      return [symbol, recent] as const;
    }));
    const bySymbol = new Map(entries);
    return {
      btcMoveBps60s: assetSymbol === "BTCUSDT" ? undefined : moveBps(bySymbol.get("BTCUSDT") ?? [], 60_000),
      btcMoveBps300s: assetSymbol === "BTCUSDT" ? undefined : moveBps(bySymbol.get("BTCUSDT") ?? [], 300_000),
      ethMoveBps60s: assetSymbol === "ETHUSDT" ? undefined : moveBps(bySymbol.get("ETHUSDT") ?? [], 60_000),
      ethMoveBps300s: assetSymbol === "ETHUSDT" ? undefined : moveBps(bySymbol.get("ETHUSDT") ?? [], 300_000)
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
    newLeaderBid: ctx.newLeaderBid,
    newLeaderStablePolls: ctx.newLeaderStablePolls,
    newLeaderStableSeconds: ctx.newLeaderStableSeconds,
    newLeaderBidMove5s: ctx.newLeaderBidMove5s,
    newLeaderBidMove10s: ctx.newLeaderBidMove10s,
    oldLeaderBidMove5s: ctx.oldLeaderBidMove5s,
    oldLeaderBidMove10s: ctx.oldLeaderBidMove10s,
    flipGap: ctx.flipGap,
    flipGapMove5s: ctx.flipGapMove5s,
    flipGapMove10s: ctx.flipGapMove10s
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
    recentSamples: spot.recentSamples,
    spotMoveBps10s: spot.spotMoveBps10s,
    spotMoveBps30s: spot.spotMoveBps30s,
    spotMoveBps60s: spot.spotMoveBps60s,
    spotMoveBps120s: spot.spotMoveBps120s,
    spotVolatilityBps10s: spot.spotVolatilityBps10s,
    spotVolatilityBps30s: spot.spotVolatilityBps30s,
    spotVolatilityBps60s: spot.spotVolatilityBps60s,
    spotVolatilityBps120s: spot.spotVolatilityBps120s,
    beatCrosses60s: spot.beatCrosses60s,
    beatCrosses120s: spot.beatCrosses120s,
    secondsSinceBeatCross: spot.secondsSinceBeatCross,
    directionStableSeconds: spot.directionStableSeconds,
    directionStableSamples: spot.directionStableSamples,
    candle1mBodyBps: spot.candle1mBodyBps,
    candle1mRangeBps: spot.candle1mRangeBps,
    candle1mVolume: spot.candle1mVolume,
    candle1mClosePosition: spot.candle1mClosePosition,
    candle5mBodyBps: spot.candle5mBodyBps,
    candle5mRangeBps: spot.candle5mRangeBps,
    candle5mVolume: spot.candle5mVolume,
    candle5mClosePosition: spot.candle5mClosePosition,
    btcMoveBps60s: spot.btcMoveBps60s,
    btcMoveBps300s: spot.btcMoveBps300s,
    ethMoveBps60s: spot.ethMoveBps60s,
    ethMoveBps300s: spot.ethMoveBps300s,
    assetVsBtcMoveBps60s: spot.assetVsBtcMoveBps60s,
    assetVsEthMoveBps60s: spot.assetVsEthMoveBps60s,
    assetVsBtcMoveBps300s: spot.assetVsBtcMoveBps300s,
    assetVsEthMoveBps300s: spot.assetVsEthMoveBps300s
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

function secondsFromStart(market: MarketSummary): number | undefined {
  const match = market.slug.match(/(?:btc|eth|sol|xrp|doge|bnb)-updown-5m-(\d{10})/i);
  if (!match) return undefined;
  return (Date.now() - Number(match[1]) * 1000) / 1000;
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

function moveBps(rows: SpotPoint[], windowMs: number): number | undefined {
  const current = rows[rows.length - 1];
  if (!current) return undefined;
  const reference = firstAtOrAfter(rows, current.timeMs - windowMs);
  return reference ? ((current.price - reference.price) / reference.price) * 10_000 : undefined;
}

function volatilityForWindow(rows: SpotPoint[], windowMs: number): number | undefined {
  const current = rows[rows.length - 1];
  if (!current) return undefined;
  return volatilityBps(rows.filter((row) => row.timeMs >= current.timeMs - windowMs).map((row) => row.price));
}

function countBeatCrosses(rows: SpotPoint[], priceToBeat: number | undefined, windowMs: number): number | undefined {
  if (priceToBeat === undefined) return undefined;
  const current = rows[rows.length - 1];
  if (!current) return undefined;
  const recent = rows.filter((row) => row.timeMs >= current.timeMs - windowMs);
  let crosses = 0;
  let previous = beatSide(recent[0]?.price, priceToBeat);
  for (const row of recent.slice(1)) {
    const side = beatSide(row.price, priceToBeat);
    if (side !== "Flat" && previous !== "Flat" && side !== previous) crosses++;
    if (side !== "Flat") previous = side;
  }
  return crosses;
}

function secondsSinceBeatCross(rows: SpotPoint[], priceToBeat: number | undefined): number | undefined {
  if (priceToBeat === undefined || rows.length < 2) return undefined;
  let previous = beatSide(rows[0]?.price, priceToBeat);
  let lastCrossMs: number | undefined;
  for (const row of rows.slice(1)) {
    const side = beatSide(row.price, priceToBeat);
    if (side !== "Flat" && previous !== "Flat" && side !== previous) lastCrossMs = row.timeMs;
    if (side !== "Flat") previous = side;
  }
  const current = rows[rows.length - 1];
  return lastCrossMs !== undefined && current ? (current.timeMs - lastCrossMs) / 1000 : undefined;
}

function directionStableSeconds(rows: SpotPoint[], priceToBeat: number | undefined): number | undefined {
  const current = rows[rows.length - 1];
  if (!current || priceToBeat === undefined) return undefined;
  const currentSide = beatSide(current.price, priceToBeat);
  if (currentSide === "Flat") return 0;
  let stableSince = current.timeMs;
  for (let index = rows.length - 1; index >= 0; index--) {
    const side = beatSide(rows[index]?.price, priceToBeat);
    if (side !== currentSide) break;
    stableSince = rows[index]?.timeMs ?? stableSince;
  }
  return (current.timeMs - stableSince) / 1000;
}

function directionStableSamples(rows: SpotPoint[], priceToBeat: number | undefined): number | undefined {
  const current = rows[rows.length - 1];
  if (!current || priceToBeat === undefined) return undefined;
  const currentSide = beatSide(current.price, priceToBeat);
  if (currentSide === "Flat") return 0;
  let count = 0;
  for (let index = rows.length - 1; index >= 0; index--) {
    if (beatSide(rows[index]?.price, priceToBeat) !== currentSide) break;
    count++;
  }
  return count;
}

function beatSide(price: number | undefined, priceToBeat: number): "Up" | "Down" | "Flat" {
  if (price === undefined) return "Flat";
  const diffBps = ((price - priceToBeat) / priceToBeat) * 10_000;
  if (Math.abs(diffBps) < 0.5) return "Flat";
  return diffBps > 0 ? "Up" : "Down";
}

function candleFields(prefix: "candle1m" | "candle5m", candle: CandlePoint | undefined): Record<string, number | undefined> {
  if (!candle) return {};
  const range = candle.high - candle.low;
  return {
    [`${prefix}BodyBps`]: ((candle.close - candle.open) / candle.open) * 10_000,
    [`${prefix}RangeBps`]: (range / candle.open) * 10_000,
    [`${prefix}Volume`]: candle.volume,
    [`${prefix}ClosePosition`]: range > 0 ? (candle.close - candle.low) / range : undefined
  };
}

function spreadDiff(value: number | undefined, reference: number | undefined): number | undefined {
  return value !== undefined && reference !== undefined ? value - reference : undefined;
}

function firstAtOrAfter(rows: SpotPoint[], timeMs: number): SpotPoint | undefined {
  return rows.find((row) => row.timeMs >= timeMs) ?? rows[0];
}

function valueMove(rows: InversionSample[], field: "newLeaderBid" | "oldLeaderBid" | "flipGap", windowMs: number): number | undefined {
  const current = rows[rows.length - 1]?.[field];
  if (current === undefined) return undefined;
  const currentTimeMs = rows[rows.length - 1]?.timeMs;
  if (currentTimeMs === undefined) return undefined;
  const reference = rows.find((row) => row.timeMs >= currentTimeMs - windowMs)?.[field] ?? rows[0]?.[field];
  return reference !== undefined ? current - reference : undefined;
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
