import fs from "node:fs";
import path from "node:path";
import { BinanceClient, SpotPoint } from "../adapters/binanceClient.js";
import { ClobClient, TokenQuote } from "../polymarket/clobClient.js";
import { GammaClient } from "../polymarket/gammaClient.js";
import { MarketSummary } from "../types.js";

type Side = "Up" | "Down";

export interface LagContinuationOptions {
  seconds: number;
  pollSecs: number;
  stake: number;
  minSecondsToEnd: number;
  maxSecondsToEnd: number;
  minSignedDistanceBps: number;
  maxSignedDistanceBps: number;
  momentumWindowSec: number;
  minMomentumBps: number;
  maxEntryAsk: number;
  exitSecondsToEnd: number;
  excludeSecondsToEndMin: number;
  excludeSecondsToEndMax: number;
  logFile: string;
}

export interface LagContinuationReport {
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

interface BtcContext {
  btcPrice: number | undefined;
  priceToBeat: number | undefined;
  momentumBps: number | undefined;
}

interface OpenTrade {
  market: MarketSummary;
  side: Side;
  entryAsk: number;
  shares: number;
  stake: number;
  openedAt: string;
  openedAtMs: number;
  entrySecondsToEnd: number;
  dominantSide: Side;
  signedDistanceBps: number;
  priceToBeat: number;
  btcPriceAtEntry: number;
  momentumBps: number | undefined;
}

// Quanto tempo apos o fim nominal da janela (5min) esperar antes de liquidar
// a posicao pelo resultado final da resolucao, quando nao ha bid ao vivo disponivel.
const RESOLUTION_FALLBACK_SECS = 45;
// A partir daqui, cada tentativa sem sucesso tambem gera um log SKIP visivel
// (a posicao continua sendo tentada indefinidamente, nunca e abandonada em silencio).
const RESOLUTION_WARN_SECS = 1200;

export class LagContinuationPaperService {
  private readonly gamma = new GammaClient();
  private readonly clob = new ClobClient();
  private readonly binance = new BinanceClient();
  private readonly spotSamples = new Map<string, SpotPoint[]>();
  private readonly priceToBeatCache = new Map<string, SpotPoint | undefined>();

  async run(options: LagContinuationOptions): Promise<LagContinuationReport> {
    ensureDir(options.logFile);
    const stateFile = path.join(path.dirname(options.logFile), "lag_continuation_open_state.json");
    const startedAt = new Date();
    let markets = await this.findBtcMarkets();
    let nextRefreshAt = 0;
    const open = loadOpenState(stateFile);
    const done = new Set<string>();
    let observations = 0;
    let entries = 0;
    let exits = 0;
    let totalStake = 0;
    let totalPnl = 0;

    if (open.size > 0) {
      appendJsonl(options.logFile, {
        type: "RESUME",
        observedAt: new Date().toISOString(),
        openPositions: [...open.keys()]
      });
    }

    while (Date.now() - startedAt.getTime() < options.seconds * 1000) {
      if (Date.now() >= nextRefreshAt) {
        markets = await this.findBtcMarkets();
        nextRefreshAt = Date.now() + 30_000;
      }

      const now = new Date().toISOString();

      // Posicoes abertas sao monitoradas independentemente da lista de mercados
      // ativos (findBtcMarkets exclui mercados com secs<=0), para nunca perder
      // o rastro de uma posicao so porque ela caiu fora da janela de varredura.
      for (const [key, existing] of [...open.entries()]) {
        const secs = secondsToEnd(existing.market);
        let closedNow = false;

        try {
          const { up, down } = await this.quoteMarket(existing.market);
          const sideQuote = existing.side === "Up" ? up : down;
          const exitBid = sideQuote.bestBid;
          const shouldExit = secs === undefined || secs <= options.exitSecondsToEnd;
          if (shouldExit && exitBid !== undefined) {
            const tradePnl = existing.shares * exitBid - existing.stake;
            totalPnl += tradePnl;
            exits++;
            open.delete(key);
            done.add(key);
            closedNow = true;
            appendJsonl(options.logFile, {
              type: "EXIT",
              observedAt: now,
              slug: existing.market.slug,
              side: existing.side,
              entryAsk: existing.entryAsk,
              exitBid,
              stake: existing.stake,
              shares: existing.shares,
              pnl: tradePnl,
              secondsToEnd: secs,
              holdSeconds: (Date.parse(now) - existing.openedAtMs) / 1000,
              dominantSide: existing.dominantSide,
              signedDistanceBps: existing.signedDistanceBps,
              priceToBeat: existing.priceToBeat,
              btcPriceAtEntry: existing.btcPriceAtEntry,
              momentumBps: existing.momentumBps,
              settledVia: "market"
            });
          }
        } catch (error) {
          appendJsonl(options.logFile, {
            type: "SKIP",
            observedAt: now,
            slug: existing.market.slug,
            reason: error instanceof Error ? error.message : String(error)
          });
        }

        if (!closedNow && secs !== undefined && secs <= -RESOLUTION_FALLBACK_SECS) {
          const settled = await this.settleViaResolution(existing).catch(() => undefined);
          if (settled) {
            totalPnl += settled.pnl;
            exits++;
            open.delete(key);
            done.add(key);
            appendJsonl(options.logFile, {
              type: "EXIT",
              observedAt: now,
              slug: existing.market.slug,
              side: existing.side,
              entryAsk: existing.entryAsk,
              exitBid: settled.resolvedPrice,
              stake: existing.stake,
              shares: existing.shares,
              pnl: settled.pnl,
              secondsToEnd: secs,
              holdSeconds: (Date.parse(now) - existing.openedAtMs) / 1000,
              dominantSide: existing.dominantSide,
              signedDistanceBps: existing.signedDistanceBps,
              priceToBeat: existing.priceToBeat,
              btcPriceAtEntry: existing.btcPriceAtEntry,
              momentumBps: existing.momentumBps,
              settledVia: "resolution"
            });
          } else if (secs <= -RESOLUTION_WARN_SECS) {
            appendJsonl(options.logFile, {
              type: "SKIP",
              observedAt: now,
              slug: existing.market.slug,
              reason: "resolution_pending_too_long"
            });
          }
        }
      }

      saveOpenState(stateFile, open);

      // Varredura de entrada: so considera mercados que ainda estao no universo
      // ativo e que nao tem posicao aberta nem ja foram operados nesta sessao.
      const scanMarkets = markets.filter((market) => {
        const key = market.marketId || market.slug;
        return !open.has(key) && !done.has(key);
      });
      const rows = await Promise.all(
        scanMarkets.map((market) =>
          this.quoteMarket(market).catch((error: unknown) => ({ market, error }))
        )
      );

      for (const row of rows) {
        if ("error" in row) {
          appendJsonl(options.logFile, {
            type: "SKIP",
            observedAt: now,
            slug: row.market.slug,
            reason: row.error instanceof Error ? row.error.message : String(row.error)
          });
          continue;
        }

        observations++;
        const { market, up, down } = row;
        const key = market.marketId || market.slug;
        const secs = secondsToEnd(market);
        const btcCtx = await this.btcContext(market).catch(() => undefined);

        const signal = evaluateSignal(market, up, down, secs, btcCtx, options);
        if (!signal.ok) continue;

        const sideQuote = signal.side === "Up" ? up : down;
        const entryAsk = sideQuote.bestAsk;
        if (entryAsk === undefined) continue;

        const tradeStake = Math.min(options.stake, entryAsk * (sideQuote.bestAskSize ?? 0));
        if (tradeStake <= 0) continue;
        const shares = tradeStake / entryAsk;
        entries++;
        totalStake += tradeStake;

        open.set(key, {
          market,
          side: signal.side,
          entryAsk,
          shares,
          stake: tradeStake,
          openedAt: now,
          openedAtMs: Date.parse(now),
          entrySecondsToEnd: secs ?? 0,
          dominantSide: signal.dominantSide,
          signedDistanceBps: signal.signedDistanceBps,
          priceToBeat: signal.priceToBeat,
          btcPriceAtEntry: signal.btcPrice,
          momentumBps: signal.momentumBps
        });
        saveOpenState(stateFile, open);

        appendJsonl(options.logFile, {
          type: "ENTRY",
          observedAt: now,
          slug: market.slug,
          side: signal.side,
          entryAsk,
          stake: tradeStake,
          shares,
          secondsToEnd: secs,
          dominantSide: signal.dominantSide,
          signedDistanceBps: signal.signedDistanceBps,
          priceToBeat: signal.priceToBeat,
          btcPrice: signal.btcPrice,
          momentumBps: signal.momentumBps
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
      stake: totalStake,
      pnl: totalPnl,
      logFile: options.logFile
    };
  }

  private async settleViaResolution(
    existing: OpenTrade
  ): Promise<{ pnl: number; resolvedPrice: number } | undefined> {
    const outcome = await this.gamma.fetchResolvedOutcome(existing.market.slug);
    if (!outcome || !outcome.closed) return undefined;
    const idx = outcome.outcomes.indexOf(existing.side);
    if (idx < 0 || outcome.outcomePrices[idx] === undefined) return undefined;
    const resolvedPrice = outcome.outcomePrices[idx];
    const pnl = existing.shares * resolvedPrice - existing.stake;
    return { pnl, resolvedPrice };
  }

  private async btcContext(market: MarketSummary): Promise<BtcContext> {
    const window = windowFromSlug(market.slug);
    const key = market.marketId || market.slug;
    const current = await this.binance.tickerPrice("BTCUSDT").catch(() => undefined);
    const samples = this.spotSamples.get(key) ?? [];
    if (current) samples.push(current);
    const cutoff = Date.now() - 180_000;
    const recent = samples.filter((s) => s.timeMs >= cutoff);
    this.spotSamples.set(key, recent);

    let beat = this.priceToBeatCache.get(key);
    if (!beat && window && Date.now() >= window.startMs) {
      beat = await this.binance.nearestPrice("BTCUSDT", window.startMs, 20_000).catch(() => undefined);
      if (beat) this.priceToBeatCache.set(key, beat);
    }
    if (!beat) beat = recent[0];

    const btcPrice = current?.price;
    const priceToBeat = beat?.price;
    const nowMs = current?.timeMs ?? Date.now();
    const refSample = recent.find((s) => s.timeMs >= nowMs - 30_000);
    const momentumBps =
      btcPrice !== undefined && refSample
        ? ((btcPrice - refSample.price) / refSample.price) * 10_000
        : undefined;

    return { btcPrice, priceToBeat, momentumBps };
  }

  private async findBtcMarkets(): Promise<MarketSummary[]> {
    const slugs = currentBtcSlugs();
    const batches = await Promise.all(
      slugs.map((slug) => this.gamma.fetchEventMarketsBySlug(slug).catch(() => []))
    );
    return dedupeMarkets(batches.flat()).filter((market) => {
      const secs = secondsToEnd(market);
      return market.tokenIds.length >= 2 && secs !== undefined && secs > 0 && secs <= 600;
    });
  }

  private async quoteMarket(
    market: MarketSummary
  ): Promise<{ market: MarketSummary; up: TokenQuote; down: TokenQuote }> {
    const [upToken, downToken] = tokenPairForUpDown(market);
    if (!upToken || !downToken) throw new Error(`Missing token pair for ${market.slug}`);
    const [up, down] = await Promise.all([
      this.clob.getTokenQuote(upToken),
      this.clob.getTokenQuote(downToken)
    ]);
    return { market, up, down };
  }
}

type EvalResult =
  | { ok: true; side: Side; dominantSide: Side; signedDistanceBps: number; priceToBeat: number; btcPrice: number; momentumBps: number }
  | { ok: false };

function evaluateSignal(
  _market: MarketSummary,
  up: TokenQuote,
  down: TokenQuote,
  secs: number | undefined,
  btcCtx: BtcContext | undefined,
  options: LagContinuationOptions
): EvalResult {
  if (secs === undefined || secs < options.minSecondsToEnd || secs >= options.maxSecondsToEnd) {
    return { ok: false };
  }
  // Zona morta identificada empiricamente (2026-07-06, n=22): secs 75-90 e a unica
  // faixa de secondsToEnd com PnL agregado negativo (WR 40.9%, -14.21 vs +372 no resto).
  if (secs >= options.excludeSecondsToEndMin && secs < options.excludeSecondsToEndMax) {
    return { ok: false };
  }
  if (!btcCtx || btcCtx.btcPrice === undefined || btcCtx.priceToBeat === undefined) {
    return { ok: false };
  }
  const { btcPrice, priceToBeat, momentumBps } = btcCtx;
  if (momentumBps === undefined) return { ok: false };

  const signedDistanceBps = ((btcPrice - priceToBeat) / btcPrice) * 10_000;
  if (signedDistanceBps < options.minSignedDistanceBps || signedDistanceBps >= options.maxSignedDistanceBps) {
    return { ok: false };
  }

  const dominantSide: Side = btcPrice >= priceToBeat ? "Up" : "Down";
  const directedMomentum = dominantSide === "Up" ? momentumBps : -momentumBps;
  if (directedMomentum < options.minMomentumBps) return { ok: false };

  const sideQuote = dominantSide === "Up" ? up : down;
  const entryAsk = sideQuote.bestAsk;
  if (entryAsk === undefined || entryAsk <= 0 || entryAsk >= 1) return { ok: false };
  if (entryAsk > options.maxEntryAsk) return { ok: false };

  return { ok: true, side: dominantSide, dominantSide, signedDistanceBps, priceToBeat, btcPrice, momentumBps };
}

function currentBtcSlugs(): string[] {
  const base = Math.floor(Date.now() / 300_000) * 300;
  const out = new Set<string>();
  for (const offset of [-1, 0, 1]) out.add(`btc-updown-5m-${base + offset * 300}`);
  return [...out];
}

function secondsToEnd(market: MarketSummary): number | undefined {
  const match = market.slug.match(/btc-updown-5m-(\d{10})/i);
  if (!match) return undefined;
  return (Number(match[1]) * 1000 + 300_000 - Date.now()) / 1000;
}

function windowFromSlug(slug: string): { startMs: number } | undefined {
  const match = slug.match(/btc-updown-5m-(\d{10})/i);
  if (!match) return undefined;
  return { startMs: Number(match[1]) * 1000 };
}

function tokenPairForUpDown(market: MarketSummary): [string | undefined, string | undefined] {
  const upIndex = market.outcomes.findIndex((o) => /^up$|^yes$/i.test(o));
  const downIndex = market.outcomes.findIndex((o) => /^down$|^no$/i.test(o));
  return [
    market.tokenIds[upIndex >= 0 ? upIndex : 0],
    market.tokenIds[downIndex >= 0 ? downIndex : 1]
  ];
}

function dedupeMarkets(markets: MarketSummary[]): MarketSummary[] {
  const byKey = new Map<string, MarketSummary>();
  for (const m of markets) byKey.set(m.marketId || m.slug, m);
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

// Persistencia das posicoes abertas em disco: sobrevive a reinicios do watchdog
// (que mata o processo a cada ciclo/hora), evitando perder o rastro de trades
// que ainda nao foram liquidados quando o processo e encerrado.
function loadOpenState(stateFile: string): Map<string, OpenTrade> {
  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    const parsed = JSON.parse(raw) as Array<[string, OpenTrade]>;
    return new Map(parsed);
  } catch {
    return new Map();
  }
}

function saveOpenState(stateFile: string, open: Map<string, OpenTrade>): void {
  ensureDir(stateFile);
  fs.writeFileSync(stateFile, JSON.stringify([...open.entries()]));
}
