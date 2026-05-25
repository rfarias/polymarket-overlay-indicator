import fs from "node:fs";
import path from "node:path";
import { ClobClient, TokenQuote } from "../polymarket/clobClient.js";
import { GammaClient } from "../polymarket/gammaClient.js";
import { MarketSummary } from "../types.js";

type Outcome = "Up" | "Down";

export interface LeggingPaperOptions {
  seconds: number;
  pollSecs: number;
  limit: number;
  maxPages: number;
  stake: number;
  cheapMax: number;
  maxSum: number;
  hedgeWindowSecs: number;
  minAskSize: number;
  durationMinutes?: number;
  minSecondsToEnd: number;
  maxSecondsToEnd: number;
  minSumBids: number;
  maxExitGapTotal: number;
  maxOppositeAskAtFirst: number;
  earlyLeaderFilter: boolean;
  elDetectMinBid: number;
  elContinuationMinBid: number;
  elVelocityMin: number;
  elBlockLeaderBidMin: number;
  logFile: string;
}

export interface LeggingPaperEvent {
  type: "FIRST_LEG" | "HEDGE_FILLED" | "EXPIRED_UNHEDGED" | "SKIP";
  observedAt: string;
  marketId: string;
  slug: string;
  title: string;
  firstOutcome?: Outcome;
  hedgeOutcome?: Outcome;
  firstPrice?: number;
  hedgePrice?: number;
  sumPrice?: number;
  secondsToEnd?: number;
  sumBids?: number;
  exitGapTotal?: number;
  elLeader?: Outcome;
  elBid240?: number;
  elBid180?: number;
  elVelocity?: number;
  elContinuationOk?: boolean;
  elCurrentLeaderBid?: number;
  elCurrentCandidateBid?: number;
  stake?: number;
  shares?: number;
  lockedProfit?: number;
  secondsToHedge?: number;
  reason?: string;
}

export interface LeggingPaperReport {
  startedAt: string;
  endedAt: string;
  markets: number;
  observations: number;
  firstLegs: number;
  hedged: number;
  expired: number;
  stakeCommitted: number;
  lockedProfit: number;
  avgSecondsToHedge: number;
  logFile: string;
}

interface OpenLeg {
  market: MarketSummary;
  firstOutcome: Outcome;
  firstPrice: number;
  stake: number;
  shares: number;
  openedAtMs: number;
}

interface EarlyLeaderSample {
  ts: number;
  secondsToEnd: number;
  upBid?: number;
  downBid?: number;
}

interface EarlyLeaderContext {
  status: "off" | "non_5m" | "warming" | "ready";
  leader?: Outcome;
  bid240?: number;
  bid180?: number;
  velocity?: number;
  continuationOk?: boolean;
  currentLeaderBid?: number;
  currentCandidateBid?: number;
}

export class UpdownLeggingPaperService {
  private readonly gamma = new GammaClient();
  private readonly clob = new ClobClient();
  private readonly earlyLeader = new EarlyLeaderTracker();

  async run(options: LeggingPaperOptions): Promise<LeggingPaperReport> {
    ensureDir(options.logFile);
    const startedAt = new Date();
    const markets = await this.findMarkets(options);
    const openLegs = new Map<string, OpenLeg>();
    const completedMarkets = new Set<string>();
    let observations = 0;
    let firstLegs = 0;
    let hedged = 0;
    let expired = 0;
    let stakeCommitted = 0;
    let lockedProfit = 0;
    const hedgeSeconds: number[] = [];

    while (Date.now() - startedAt.getTime() < options.seconds * 1000) {
      const quotes = await Promise.all(markets.map((market) =>
        this.quoteMarket(market).catch((error) => ({
          market,
          error: error instanceof Error ? error.message : String(error)
        }))
      ));
      const now = Date.now();

      for (const item of quotes) {
        if ("error" in item) {
          appendJsonl(options.logFile, {
            type: "SKIP",
            observedAt: new Date(now).toISOString(),
            marketId: item.market.marketId,
            slug: item.market.slug,
            title: item.market.title,
            reason: item.error
          } satisfies LeggingPaperEvent);
          continue;
        }
        observations++;
        const { market, up, down } = item;
        const el = this.earlyLeader.update(market, up, down, now);
        const key = market.marketId || market.slug;
        const open = openLegs.get(key);

        if (open) {
          const hedgeOutcome: Outcome = open.firstOutcome === "Up" ? "Down" : "Up";
          const hedgeQuote = hedgeOutcome === "Up" ? up : down;
          const hedgePrice = hedgeQuote.bestAsk;
          const secondsToHedge = (now - open.openedAtMs) / 1000;
          if (hedgePrice !== undefined && open.firstPrice + hedgePrice <= options.maxSum && (hedgeQuote.bestAskSize ?? 0) >= open.shares) {
            const sumPrice = open.firstPrice + hedgePrice;
            const profit = (1 - sumPrice) * open.shares;
            hedged++;
            lockedProfit += profit;
            hedgeSeconds.push(secondsToHedge);
            openLegs.delete(key);
            completedMarkets.add(key);
            appendJsonl(options.logFile, {
              type: "HEDGE_FILLED",
              observedAt: new Date(now).toISOString(),
              marketId: market.marketId,
              slug: market.slug,
              title: market.title,
              firstOutcome: open.firstOutcome,
              hedgeOutcome,
              firstPrice: open.firstPrice,
              hedgePrice,
              sumPrice,
              secondsToEnd: secondsToEnd(market),
              sumBids: sumBids(up, down),
              exitGapTotal: exitGapTotal(up, down),
              ...earlyLeaderEventFields(el),
              stake: open.stake,
              shares: open.shares,
              lockedProfit: profit,
              secondsToHedge
            } satisfies LeggingPaperEvent);
          } else if (secondsToHedge >= options.hedgeWindowSecs) {
            expired++;
            openLegs.delete(key);
            completedMarkets.add(key);
            appendJsonl(options.logFile, {
              type: "EXPIRED_UNHEDGED",
              observedAt: new Date(now).toISOString(),
              marketId: market.marketId,
              slug: market.slug,
              title: market.title,
              firstOutcome: open.firstOutcome,
              firstPrice: open.firstPrice,
              stake: open.stake,
              shares: open.shares,
              secondsToHedge,
              reason: "No hedge fill inside hedge window."
            } satisfies LeggingPaperEvent);
          }
          continue;
        }

        if (completedMarkets.has(key)) continue;
        const candidate = cheapestLeg(up, down, options.cheapMax, options.minAskSize);
        if (!candidate) continue;
        const opposite = candidate.outcome === "Up" ? down : up;
        if (opposite.bestAsk !== undefined && opposite.bestAsk > options.maxOppositeAskAtFirst) {
          appendJsonl(options.logFile, {
            type: "SKIP",
            observedAt: new Date(now).toISOString(),
            marketId: market.marketId,
            slug: market.slug,
            title: market.title,
            firstOutcome: candidate.outcome,
            firstPrice: candidate.quote.bestAsk,
            hedgePrice: opposite.bestAsk,
            sumPrice: candidate.quote.bestAsk! + opposite.bestAsk,
            secondsToEnd: secondsToEnd(market),
            sumBids: sumBids(up, down),
            exitGapTotal: exitGapTotal(up, down),
            ...earlyLeaderEventFields(el),
            reason: `opposite_ask ${opposite.bestAsk.toFixed(3)} > ${options.maxOppositeAskAtFirst}`
          } satisfies LeggingPaperEvent);
          continue;
        }
        const quality = entryQuality(market, up, down, options);
        if (!quality.ok) {
          appendJsonl(options.logFile, {
            type: "SKIP",
            observedAt: new Date(now).toISOString(),
            marketId: market.marketId,
            slug: market.slug,
            title: market.title,
            firstOutcome: candidate.outcome,
            firstPrice: candidate.quote.bestAsk,
            secondsToEnd: quality.secondsToEnd,
            sumBids: quality.sumBids,
            exitGapTotal: quality.exitGapTotal,
            ...earlyLeaderEventFields(el),
            reason: quality.reason
          } satisfies LeggingPaperEvent);
          continue;
        }
        const elDecision = evaluateEarlyLeaderGate(candidate.outcome, el, options);
        if (!elDecision.ok) {
          appendJsonl(options.logFile, {
            type: "SKIP",
            observedAt: new Date(now).toISOString(),
            marketId: market.marketId,
            slug: market.slug,
            title: market.title,
            firstOutcome: candidate.outcome,
            firstPrice: candidate.quote.bestAsk,
            hedgePrice: opposite.bestAsk,
            sumPrice: opposite.bestAsk === undefined ? undefined : candidate.quote.bestAsk! + opposite.bestAsk,
            secondsToEnd: quality.secondsToEnd,
            sumBids: quality.sumBids,
            exitGapTotal: quality.exitGapTotal,
            ...earlyLeaderEventFields(el),
            reason: elDecision.reason
          } satisfies LeggingPaperEvent);
          continue;
        }
        const stake = Math.min(options.stake, candidate.quote.bestAsk! * (candidate.quote.bestAskSize ?? 0));
        if (stake <= 0) continue;
        const shares = stake / candidate.quote.bestAsk!;
        firstLegs++;
        stakeCommitted += stake;
        openLegs.set(key, {
          market,
          firstOutcome: candidate.outcome,
          firstPrice: candidate.quote.bestAsk!,
          stake,
          shares,
          openedAtMs: now
        });
        appendJsonl(options.logFile, {
          type: "FIRST_LEG",
          observedAt: new Date(now).toISOString(),
          marketId: market.marketId,
          slug: market.slug,
          title: market.title,
          firstOutcome: candidate.outcome,
          firstPrice: candidate.quote.bestAsk,
          secondsToEnd: quality.secondsToEnd,
          sumBids: quality.sumBids,
          exitGapTotal: quality.exitGapTotal,
          ...earlyLeaderEventFields(el),
          stake,
          shares
        } satisfies LeggingPaperEvent);

        const hedgeOutcome: Outcome = candidate.outcome === "Up" ? "Down" : "Up";
        const hedgeQuote = hedgeOutcome === "Up" ? up : down;
        const hedgePrice = hedgeQuote.bestAsk;
        if (hedgePrice !== undefined && candidate.quote.bestAsk! + hedgePrice <= options.maxSum && (hedgeQuote.bestAskSize ?? 0) >= shares) {
          const sumPrice = candidate.quote.bestAsk! + hedgePrice;
          const profit = (1 - sumPrice) * shares;
          hedged++;
          lockedProfit += profit;
          hedgeSeconds.push(0);
          openLegs.delete(key);
          completedMarkets.add(key);
          appendJsonl(options.logFile, {
            type: "HEDGE_FILLED",
            observedAt: new Date(now).toISOString(),
            marketId: market.marketId,
            slug: market.slug,
            title: market.title,
            firstOutcome: candidate.outcome,
            hedgeOutcome,
            firstPrice: candidate.quote.bestAsk,
            hedgePrice,
            sumPrice,
            secondsToEnd: quality.secondsToEnd,
            sumBids: quality.sumBids,
            exitGapTotal: quality.exitGapTotal,
            ...earlyLeaderEventFields(el),
            stake,
            shares,
            lockedProfit: profit,
            secondsToHedge: 0
          } satisfies LeggingPaperEvent);
        }
      }

      await sleep(options.pollSecs * 1000);
    }

    const endedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      markets: markets.length,
      observations,
      firstLegs,
      hedged,
      expired,
      stakeCommitted,
      lockedProfit,
      avgSecondsToHedge: avg(hedgeSeconds),
      logFile: options.logFile
    };
  }

  private async findMarkets(options: LeggingPaperOptions): Promise<MarketSummary[]> {
    const bySlug = await this.fetchCurrentCryptoUpdownMarkets(options.durationMinutes);
    if (bySlug.length > 0) return bySlug;

    const markets = await this.gamma.fetchActiveEvents(options.limit, options.maxPages);
    return dedupeMarkets(markets).filter((market) =>
      market.active &&
      !market.closed &&
      market.acceptingOrders &&
      market.tokenIds.length >= 2 &&
      isCurrentCryptoUpdownMarket(market)
    );
  }

  private async fetchCurrentCryptoUpdownMarkets(durationMinutes?: number): Promise<MarketSummary[]> {
    const slugs = currentCryptoUpdownSlugs(durationMinutes);
    const batches = await Promise.all(slugs.map((slug) => this.gamma.fetchEventMarketsBySlug(slug).catch(() => [])));
    return dedupeMarkets(batches.flat()).filter((market) => market.tokenIds.length >= 2 && isCurrentCryptoUpdownMarket(market));
  }

  private async quoteMarket(market: MarketSummary): Promise<{ market: MarketSummary; up: TokenQuote; down: TokenQuote }> {
    const [upToken, downToken] = tokenPairForUpDown(market);
    if (!upToken || !downToken) throw new Error(`Missing token pair for ${market.slug}`);
    const [up, down] = await Promise.all([
      this.clob.getTokenQuote(upToken),
      this.clob.getTokenQuote(downToken)
    ]);
    return { market, up, down };
  }
}

class EarlyLeaderTracker {
  private readonly samplesByMarket = new Map<string, EarlyLeaderSample[]>();

  update(market: MarketSummary, up: TokenQuote, down: TokenQuote, now: number): EarlyLeaderContext {
    if (inferDurationMinutes(market.slug) !== 5) return { status: "non_5m" };
    const secs = secondsToEnd(market);
    if (secs === undefined) return { status: "warming" };

    const key = market.marketId || market.slug;
    const samples = this.samplesByMarket.get(key) ?? [];
    samples.push({
      ts: now,
      secondsToEnd: secs,
      upBid: up.bestBid,
      downBid: down.bestBid
    });
    const trimmed = samples.filter((sample) => sample.secondsToEnd >= 90 && sample.secondsToEnd <= 250);
    this.samplesByMarket.set(key, trimmed);

    return buildEarlyLeaderContext(trimmed, up, down);
  }
}

function buildEarlyLeaderContext(samples: EarlyLeaderSample[], up: TokenQuote, down: TokenQuote): EarlyLeaderContext {
  const detect = samples.filter((sample) => sample.secondsToEnd <= 240 && sample.secondsToEnd >= 181);
  if (detect.length < 2) return { status: "warming" };

  const up240 = avgDefined(detect.map((sample) => sample.upBid));
  const down240 = avgDefined(detect.map((sample) => sample.downBid));
  if (up240 === undefined && down240 === undefined) return { status: "warming" };

  const leader: Outcome = (up240 ?? 0) >= (down240 ?? 0) ? "Up" : "Down";
  const bid240 = leader === "Up" ? up240 : down240;
  if (bid240 === undefined || bid240 < 0.55) return { status: "warming" };

  const continuation = samples.filter((sample) => sample.secondsToEnd <= 180 && sample.secondsToEnd >= 121);
  const leader180Values = continuation.map((sample) => leader === "Up" ? sample.upBid : sample.downBid);
  const bid180 = avgDefined(leader180Values);
  const minBid180 = minDefined(leader180Values);
  const currentLeaderBid = leader === "Up" ? up.bestBid : down.bestBid;
  const currentCandidateBid = leader === "Up" ? down.bestBid : up.bestBid;

  return {
    status: "ready",
    leader,
    bid240,
    bid180,
    velocity: bid180 === undefined ? undefined : bid180 - bid240,
    continuationOk: minBid180 !== undefined && minBid180 >= 0.70,
    currentLeaderBid,
    currentCandidateBid
  };
}

function evaluateEarlyLeaderGate(
  candidate: Outcome,
  context: EarlyLeaderContext,
  options: LeggingPaperOptions
): { ok: boolean; reason: string } {
  if (!options.earlyLeaderFilter) return { ok: true, reason: "early_leader_filter_off" };
  if (context.status !== "ready" || !context.leader) {
    return { ok: false, reason: `early_leader_${context.status}` };
  }
  if ((context.bid240 ?? 0) < options.elDetectMinBid) {
    return { ok: false, reason: `el_bid240 ${(context.bid240 ?? 0).toFixed(3)} < ${options.elDetectMinBid}` };
  }
  if (candidate === context.leader) {
    return { ok: false, reason: "candidate_is_original_early_leader" };
  }

  const continuationStrong =
    Boolean(context.continuationOk) &&
    (context.velocity ?? -999) >= options.elVelocityMin &&
    (context.currentLeaderBid ?? 0) >= options.elBlockLeaderBidMin;

  if (continuationStrong) {
    return {
      ok: false,
      reason: `early_leader_continuation_strong leader=${context.leader} current=${(context.currentLeaderBid ?? 0).toFixed(3)} velocity=${(context.velocity ?? 0).toFixed(3)}`
    };
  }

  return { ok: true, reason: "early_leader_weakened_or_unconfirmed_continuation" };
}

function earlyLeaderEventFields(context: EarlyLeaderContext): Pick<
  LeggingPaperEvent,
  "elLeader" | "elBid240" | "elBid180" | "elVelocity" | "elContinuationOk" | "elCurrentLeaderBid" | "elCurrentCandidateBid"
> {
  return {
    elLeader: context.leader,
    elBid240: context.bid240,
    elBid180: context.bid180,
    elVelocity: context.velocity,
    elContinuationOk: context.continuationOk,
    elCurrentLeaderBid: context.currentLeaderBid,
    elCurrentCandidateBid: context.currentCandidateBid
  };
}

function cheapestLeg(up: TokenQuote, down: TokenQuote, cheapMax: number, minAskSize: number): { outcome: Outcome; quote: TokenQuote } | undefined {
  const candidates = [
    { outcome: "Up" as const, quote: up },
    { outcome: "Down" as const, quote: down }
  ].filter((item) => item.quote.bestAsk !== undefined && item.quote.bestAsk <= cheapMax && (item.quote.bestAskSize ?? 0) >= minAskSize);
  return candidates.sort((a, b) => a.quote.bestAsk! - b.quote.bestAsk!)[0];
}

function tokenPairForUpDown(market: MarketSummary): [string | undefined, string | undefined] {
  const upIndex = market.outcomes.findIndex((outcome) => /^up$|^yes$/i.test(outcome));
  const downIndex = market.outcomes.findIndex((outcome) => /^down$|^no$/i.test(outcome));
  return [market.tokenIds[upIndex >= 0 ? upIndex : 0], market.tokenIds[downIndex >= 0 ? downIndex : 1]];
}

function isCurrentCryptoUpdownMarket(market: MarketSummary): boolean {
  const text = `${market.slug} ${market.title}`;
  if (!/(?:btc|bitcoin|eth|ethereum|sol|solana|xrp|doge|dogecoin|bnb)/i.test(text)) {
    return false;
  }
  if (!/(?:updown|up or down)/i.test(text)) {
    return false;
  }

  const match = market.slug.match(/(?:btc|eth|sol|xrp|doge|bnb)-updown-(\d+)(?:m|h)-(\d{10})/i);
  if (!match) return false;

  const durationRaw = Number(match[1]);
  const durationMs = /-updown-\d+h-/i.test(market.slug) ? durationRaw * 3_600_000 : durationRaw * 60_000;
  const startMs = Number(match[2]) * 1000;
  const now = Date.now();
  return startMs <= now + 10 * 60_000 && startMs + durationMs >= now - 2 * 60_000;
}

function entryQuality(
  market: MarketSummary,
  up: TokenQuote,
  down: TokenQuote,
  options: LeggingPaperOptions
): { ok: boolean; reason: string; secondsToEnd?: number; sumBids?: number; exitGapTotal?: number } {
  const secs = secondsToEnd(market);
  const bids = sumBids(up, down);
  const gap = exitGapTotal(up, down);
  const duration = inferDurationMinutes(market.slug);
  const reasons: string[] = [];
  if (options.durationMinutes && duration !== options.durationMinutes) reasons.push(`duration ${duration}m != ${options.durationMinutes}m`);
  if (secs === undefined) reasons.push("seconds_to_end unavailable");
  else {
    if (secs < options.minSecondsToEnd) reasons.push(`seconds_to_end ${secs.toFixed(1)} < ${options.minSecondsToEnd}`);
    if (secs > options.maxSecondsToEnd) reasons.push(`seconds_to_end ${secs.toFixed(1)} > ${options.maxSecondsToEnd}`);
  }
  if (bids !== undefined && bids < options.minSumBids) reasons.push(`sum_bids ${bids.toFixed(3)} < ${options.minSumBids}`);
  if (gap !== undefined && gap > options.maxExitGapTotal) reasons.push(`exit_gap_total ${gap.toFixed(3)} > ${options.maxExitGapTotal}`);
  return {
    ok: reasons.length === 0,
    reason: reasons.length ? reasons.join("; ") : "ok",
    secondsToEnd: secs,
    sumBids: bids,
    exitGapTotal: gap
  };
}

function secondsToEnd(market: MarketSummary): number | undefined {
  const info = inferSlugWindow(market.slug);
  if (!info) return undefined;
  return (info.endMs - Date.now()) / 1000;
}

function inferDurationMinutes(slug: string): number | undefined {
  return inferSlugWindow(slug)?.durationMinutes;
}

function inferSlugWindow(slug: string): { startMs: number; endMs: number; durationMinutes: number } | undefined {
  const match = slug.match(/(?:btc|eth|sol|xrp|doge|bnb)-updown-(\d+)(m|h)-(\d{10})/i);
  if (!match) return undefined;
  const raw = Number(match[1]);
  const durationMinutes = match[2].toLowerCase() === "h" ? raw * 60 : raw;
  const startMs = Number(match[3]) * 1000;
  return { startMs, endMs: startMs + durationMinutes * 60_000, durationMinutes };
}

function sumBids(up: TokenQuote, down: TokenQuote): number | undefined {
  if (up.bestBid === undefined || down.bestBid === undefined) return undefined;
  return up.bestBid + down.bestBid;
}

function exitGapTotal(up: TokenQuote, down: TokenQuote): number | undefined {
  if (up.bestAsk === undefined || down.bestAsk === undefined || up.bestBid === undefined || down.bestBid === undefined) return undefined;
  return round2(up.bestAsk + 0.01) - up.bestBid + round2(down.bestAsk + 0.01) - down.bestBid;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function currentCryptoUpdownSlugs(durationMinutes?: number): string[] {
  const assets = ["btc", "eth", "sol", "xrp", "doge", "bnb"];
  const durations = [
    { label: "5m", ms: 5 * 60_000 },
    { label: "15m", ms: 15 * 60_000 },
    { label: "4h", ms: 4 * 3_600_000 }
  ].filter((duration) => durationMinutes === undefined || duration.ms === durationMinutes * 60_000);
  const now = Date.now();
  const slugs = new Set<string>();
  for (const asset of assets) {
    for (const duration of durations) {
      const base = Math.floor(now / duration.ms) * duration.ms;
      for (const offset of [-1, 0, 1]) {
        slugs.add(`${asset}-updown-${duration.label}-${Math.round((base + offset * duration.ms) / 1000)}`);
      }
    }
  }
  return [...slugs];
}

function dedupeMarkets(markets: MarketSummary[]): MarketSummary[] {
  const byKey = new Map<string, MarketSummary>();
  for (const market of markets) {
    byKey.set(market.marketId || market.slug, market);
  }
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

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function avgDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  return defined.length ? avg(defined) : undefined;
}

function minDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
  return defined.length ? Math.min(...defined) : undefined;
}
