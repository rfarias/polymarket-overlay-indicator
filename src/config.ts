import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  gammaApiBase: process.env.GAMMA_API_BASE ?? "https://gamma-api.polymarket.com",
  dataApiBase: process.env.DATA_API_BASE ?? "https://data-api.polymarket.com",
  clobApiBase: process.env.CLOB_API_BASE ?? "https://clob.polymarket.com",
  binanceApiBase: process.env.BINANCE_API_BASE ?? "https://api.binance.com",
  databaseUrl: process.env.DATABASE_URL ?? "file:local.db",
  scanLimit: Number(process.env.SCAN_LIMIT ?? 40),
  scanMaxPages: Number(process.env.SCAN_MAX_PAGES ?? 1),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 8000),
  minNetEdge: Number(process.env.MIN_NET_EDGE ?? 0.04),
  minConfidence: Number(process.env.MIN_CONFIDENCE ?? 0.55),
  minLiquidity: Number(process.env.MIN_LIQUIDITY ?? 250),
  maxPaperStake: Number(process.env.MAX_PAPER_STAKE ?? 10),
  binanceSymbol: process.env.BINANCE_SYMBOL ?? "BTCUSDT"
};
