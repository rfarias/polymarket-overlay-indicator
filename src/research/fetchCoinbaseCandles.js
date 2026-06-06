import fs from 'node:fs/promises';
import path from 'node:path';

const COINBASE_API = 'https://api.exchange.coinbase.com/products/BTC-USD/candles';
const MAX_CANDLES_PER_REQUEST = 300;

function ensureDir(dir) {
  return fs.mkdir(dir, { recursive: true });
}

function toIso(ts) {
  return new Date(ts).toISOString();
}

async function fetchChunk({ startTs, endTs, granularitySec }) {
  const url = new URL(COINBASE_API);
  url.searchParams.set('granularity', String(granularitySec));
  url.searchParams.set('start', toIso(startTs));
  url.searchParams.set('end', toIso(endTs));

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'polymarket-overlay-indicator-research'
    }
  });

  if (!res.ok) {
    throw new Error(`coinbase candles request failed: ${res.status}`);
  }

  const rows = await res.json();
  return rows.map(([time, low, high, open, close, volume]) => ({
    ts: Number(time) * 1000,
    low: Number(low),
    high: Number(high),
    open: Number(open),
    close: Number(close),
    volume: Number(volume)
  }));
}

export async function loadCoinbaseCandles({
  startTs,
  endTs,
  granularitySec = 60,
  cacheDir = path.resolve(process.cwd(), 'data', 'coinbase')
}) {
  const cacheFile = path.join(
    cacheDir,
    `btc-usd-${granularitySec}s-${Math.floor(startTs / 1000)}-${Math.floor(endTs / 1000)}.json`
  );

  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    return cached;
  } catch {}

  await ensureDir(cacheDir);

  const chunkMs = MAX_CANDLES_PER_REQUEST * granularitySec * 1000;
  const allRows = [];

  for (let cursor = startTs; cursor < endTs; cursor += chunkMs) {
    const chunkEnd = Math.min(endTs, cursor + chunkMs);
    const rows = await fetchChunk({
      startTs: cursor,
      endTs: chunkEnd,
      granularitySec
    });
    allRows.push(...rows);
  }

  const deduped = [...new Map(
    allRows
      .filter((row) => Number.isFinite(row.ts) && Number.isFinite(row.close))
      .map((row) => [row.ts, row])
  ).values()]
    .sort((a, b) => a.ts - b.ts);

  await fs.writeFile(cacheFile, JSON.stringify(deduped, null, 2));
  return deduped;
}
