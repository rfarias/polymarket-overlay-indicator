import fs from "node:fs/promises";
import path from "node:path";
import { ExhaustionBacktestDataset, BtcPricePoint, UpDownMarketWindow } from "../strategies/exhaustionReversal/types.js";
import { getArgValue, getNumberArg } from "../utils/args.js";
import { toNumber } from "../utils/http.js";

type BinanceInterval = "1s" | "1m";

type KlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

interface CandlePoint {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  close: number;
  volume: number;
}

const args = process.argv.slice(2);
const input = getArgValue(args, "--input");
const output = getArgValue(args, "--output");
const symbol = getArgValue(args, "--symbol", "BTCUSDT")!;
const interval = parseInterval(getArgValue(args, "--interval", "1s")!);
const baseUrl = getArgValue(args, "--binance-base-url", "https://api.binance.com")!;
const cacheFile = getArgValue(args, "--cache-file");
const requestDelayMs = getNumberArg(args, "--request-delay-ms", 100);
const overwriteTargets = args.includes("--overwrite-targets");
const resolveFromBtcProxy = args.includes("--resolve-from-btc-proxy");

if (!input || !output) {
  console.error(
    "Uso: npm run enrich-btc5-dataset -- --input data/external-btc5/dataset.json --output data/external-btc5/dataset.enriched.json [--interval 1s]"
  );
  process.exit(1);
}

const dataset = JSON.parse(await fs.readFile(path.resolve(input), "utf8")) as ExhaustionBacktestDataset;
const marketWindows = validWindows(dataset.markets);
if (marketWindows.length === 0) {
  throw new Error("Dataset sem mercados com start/end validos.");
}

const ranges = buildFetchRanges(marketWindows, 60_000);
const candles = cacheFile
  ? await readOrFetchCachedCandles(path.resolve(cacheFile), { baseUrl, symbol, interval, ranges, requestDelayMs })
  : await fetchCandles({ baseUrl, symbol, interval, ranges, requestDelayMs });

if (candles.length === 0) {
  throw new Error("Nenhum candle Binance retornado para o periodo do dataset.");
}

const btcPrices = mergeBtcPrices(dataset.btcPrices ?? [], candles.map((candle) => ({
  timeMs: candle.closeTimeMs,
  price: candle.close,
  volume: candle.volume,
  source: "binance" as const
})));

let enrichedTargets = 0;
let proxyResolved = 0;
const enrichedMarkets = dataset.markets.map((market) => {
  const start = nearestCandle(candles, market.startTimeMs);
  const end = resolveFromBtcProxy ? nearestCandle(candles, market.endTimeMs) : undefined;
  const next = { ...market };
  if (shouldEnrichTarget(market, overwriteTargets) && start) {
    next.priceToBeat = start.close;
    enrichedTargets++;
  }
  if (resolveFromBtcProxy && !next.result && end && Number.isFinite(next.priceToBeat) && next.priceToBeat > 0) {
    next.result = end.close >= next.priceToBeat ? "UP" : "DOWN";
    proxyResolved++;
  }
  return next;
});

const sourceNotes = [
  ...new Set([
    ...((dataset as ExhaustionBacktestDataset & { sourceNotes?: string[] }).sourceNotes ?? []),
    `Enriched missing priceToBeat with Binance ${symbol} ${interval} candle close nearest to market start.`,
    resolveFromBtcProxy ? `Resolved missing market results with Binance ${symbol} ${interval} candle close nearest to market end.` : "",
    `Added Binance ${symbol} ${interval} candles as BTC proxy price series.`,
    "This enrichment is EXCHANGE_PROXY, not Chainlink/Data Streams resolution ground truth."
  ].filter(Boolean))
];

const outputDataset = {
  ...dataset,
  markets: enrichedMarkets,
  btcPrices,
  sourceNotes
};

await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(path.resolve(output), JSON.stringify(outputDataset, null, 2));

console.log(JSON.stringify({
  ok: true,
  input: path.resolve(input),
  output: path.resolve(output),
  symbol,
  interval,
  markets: dataset.markets.length,
  enrichedTargets,
  proxyResolved,
  btcPrices: btcPrices.length,
  fetchedCandles: candles.length,
  ranges: ranges.map((range) => ({
    start: new Date(range.startMs).toISOString(),
    end: new Date(range.endMs).toISOString()
  }))
}, null, 2));

function validWindows(markets: UpDownMarketWindow[]): UpDownMarketWindow[] {
  return markets.filter((market) =>
    Number.isFinite(market.startTimeMs) &&
    Number.isFinite(market.endTimeMs) &&
    market.startTimeMs > 0 &&
    market.endTimeMs > market.startTimeMs
  );
}

function shouldEnrichTarget(market: UpDownMarketWindow, overwrite: boolean): boolean {
  return overwrite || !Number.isFinite(market.priceToBeat) || market.priceToBeat <= 0;
}

function buildFetchRanges(markets: UpDownMarketWindow[], paddingMs: number): Array<{ startMs: number; endMs: number }> {
  const sorted = markets
    .map((market) => ({
      startMs: market.startTimeMs - paddingMs,
      endMs: market.endTimeMs + paddingMs
    }))
    .sort((a, b) => a.startMs - b.startMs);
  const ranges: Array<{ startMs: number; endMs: number }> = [];
  const mergeGapMs = 10 * 60_000;

  for (const range of sorted) {
    const previous = ranges[ranges.length - 1];
    if (!previous || range.startMs > previous.endMs + mergeGapMs) {
      ranges.push({ ...range });
    } else {
      previous.endMs = Math.max(previous.endMs, range.endMs);
    }
  }

  return ranges;
}

function parseInterval(value: string): BinanceInterval {
  if (value === "1s" || value === "1m") return value;
  throw new Error("--interval deve ser 1s ou 1m.");
}

async function readOrFetchCachedCandles(
  file: string,
  options: Parameters<typeof fetchCandles>[0]
): Promise<CandlePoint[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const cached = JSON.parse(raw) as { candles?: CandlePoint[] };
    if (Array.isArray(cached.candles) && cached.candles.length > 0) return cached.candles;
  } catch {
    // cache miss
  }
  const candles = await fetchCandles(options);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ ...options, candles }, null, 2));
  return candles;
}

async function fetchCandles(options: {
  baseUrl: string;
  symbol: string;
  interval: BinanceInterval;
  ranges: Array<{ startMs: number; endMs: number }>;
  requestDelayMs: number;
}): Promise<CandlePoint[]> {
  const byOpenTime = new Map<number, CandlePoint>();
  const intervalMs = options.interval === "1s" ? 1_000 : 60_000;

  for (const range of options.ranges) {
    let cursor = Math.floor(range.startMs / intervalMs) * intervalMs;
    while (cursor <= range.endMs) {
      const url = new URL("/api/v3/klines", options.baseUrl);
      url.searchParams.set("symbol", options.symbol);
      url.searchParams.set("interval", options.interval);
      url.searchParams.set("startTime", String(cursor));
      url.searchParams.set("endTime", String(Math.min(range.endMs, cursor + intervalMs * 1000 - 1)));
      url.searchParams.set("limit", "1000");

      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Binance klines HTTP ${response.status}: ${body.slice(0, 300)}`);
      }
      const rows = await response.json() as KlineRow[];
      if (rows.length === 0) break;

      let lastOpenTime = cursor;
      for (const row of rows) {
        const candle = candleFromRow(row);
        if (!candle) continue;
        byOpenTime.set(candle.openTimeMs, candle);
        lastOpenTime = candle.openTimeMs;
      }

      cursor = lastOpenTime + intervalMs;
      if (options.requestDelayMs > 0) await sleep(options.requestDelayMs);
    }
  }

  return [...byOpenTime.values()].sort((a, b) => a.openTimeMs - b.openTimeMs);
}

function candleFromRow(row: KlineRow): CandlePoint | undefined {
  const open = toNumber(row[1]);
  const close = toNumber(row[4]);
  const volume = toNumber(row[5]);
  if (!Number.isFinite(open) || !Number.isFinite(close) || open <= 0 || close <= 0) return undefined;
  return {
    openTimeMs: row[0],
    closeTimeMs: row[6],
    open,
    close,
    volume
  };
}

function nearestCandle(candles: CandlePoint[], timeMs: number): CandlePoint | undefined {
  let best: CandlePoint | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candle of candles) {
    const distance = Math.abs(candle.closeTimeMs - timeMs);
    if (distance < bestDistance) {
      best = candle;
      bestDistance = distance;
    }
  }
  return best;
}

function mergeBtcPrices(existing: BtcPricePoint[], incoming: BtcPricePoint[]): BtcPricePoint[] {
  const byTime = new Map<number, BtcPricePoint>();
  for (const point of existing) if (Number.isFinite(point.timeMs) && point.price > 0) byTime.set(point.timeMs, point);
  for (const point of incoming) byTime.set(point.timeMs, point);
  return [...byTime.values()].sort((a, b) => a.timeMs - b.timeMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
