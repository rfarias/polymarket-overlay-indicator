import { LeaderboardCategory, LeaderboardTrader, UserActivity } from "../polymarket/dataApiClient.js";

export interface WalletProfile {
  category: LeaderboardCategory;
  trader: LeaderboardTrader;
  activity: UserActivity[];
  metrics: {
    pnl: number;
    volume: number;
    roiOnVolume: number;
    tradeCount: number;
    uniqueMarkets: number;
    avgTradeSize: number;
    buyShare: number;
    sellShare: number;
    concentration: number;
    recentTrades24h: number;
  };
  qualityScore: number;
  copyRisk: "LOW" | "MEDIUM" | "HIGH";
  strategyHypothesis: string[];
  copyPaperCandidates: Array<{
    timestamp: number;
    side?: string;
    price: number;
    usdcSize: number;
    slug?: string;
    title?: string;
    outcome?: string;
  }>;
  warnings: string[];
}

export function buildWalletProfile(
  category: LeaderboardCategory,
  trader: LeaderboardTrader,
  activity: UserActivity[],
  nowSeconds = Math.floor(Date.now() / 1000)
): WalletProfile {
  const trades = activity.filter((item) => item.type === "TRADE" || !item.type);
  const volume = trader.vol;
  const pnl = trader.pnl;
  const roiOnVolume = volume > 0 ? pnl / volume : 0;
  const markets = new Set(trades.map((item) => item.slug ?? item.conditionId ?? "").filter(Boolean));
  const totalUsdc = trades.reduce((sum, item) => sum + item.usdcSize, 0);
  const avgTradeSize = trades.length ? totalUsdc / trades.length : 0;
  const buys = trades.filter((item) => item.side === "BUY").length;
  const sells = trades.filter((item) => item.side === "SELL").length;
  const marketTotals = new Map<string, number>();
  for (const trade of trades) {
    const key = trade.slug ?? trade.conditionId ?? "unknown";
    marketTotals.set(key, (marketTotals.get(key) ?? 0) + trade.usdcSize);
  }
  const largestMarket = Math.max(0, ...marketTotals.values());
  const concentration = totalUsdc > 0 ? largestMarket / totalUsdc : 0;
  const recentTrades24h = trades.filter((item) => item.timestamp >= nowSeconds - 86_400).length;

  const metrics = {
    pnl,
    volume,
    roiOnVolume,
    tradeCount: trades.length,
    uniqueMarkets: markets.size,
    avgTradeSize,
    buyShare: trades.length ? buys / trades.length : 0,
    sellShare: trades.length ? sells / trades.length : 0,
    concentration,
    recentTrades24h
  };

  const warnings = buildWarnings(metrics);
  const qualityScore = scoreWallet(metrics, warnings);
  const copyRisk = qualityScore >= 70 && warnings.length <= 1 ? "LOW" : qualityScore >= 45 ? "MEDIUM" : "HIGH";

  return {
    category,
    trader,
    activity: trades,
    metrics,
    qualityScore,
    copyRisk,
    strategyHypothesis: inferStrategy(category, trades, metrics),
    copyPaperCandidates: trades
      .filter((item) => item.timestamp >= nowSeconds - 86_400 && item.side === "BUY" && item.usdcSize >= 10)
      .slice(0, 10)
      .map((item) => ({
        timestamp: item.timestamp,
        side: item.side,
        price: item.price,
        usdcSize: item.usdcSize,
        slug: item.slug,
        title: item.title,
        outcome: item.outcome
      })),
    warnings
  };
}

function scoreWallet(metrics: WalletProfile["metrics"], warnings: string[]): number {
  let score = 50;
  score += Math.min(25, Math.max(-25, metrics.roiOnVolume * 200));
  score += Math.min(15, metrics.tradeCount / 3);
  score += Math.min(10, metrics.uniqueMarkets * 1.5);
  if (metrics.recentTrades24h > 0) score += 8;
  if (metrics.concentration > 0.75) score -= 20;
  if (metrics.volume > 0 && metrics.pnl <= 0) score -= 20;
  score -= warnings.length * 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildWarnings(metrics: WalletProfile["metrics"]): string[] {
  const warnings: string[] = [];
  if (metrics.tradeCount < 10) warnings.push("Small activity sample.");
  if (metrics.concentration > 0.75) warnings.push("Highly concentrated in one market.");
  if (metrics.roiOnVolume < 0.01) warnings.push("Low PnL relative to volume.");
  if (metrics.recentTrades24h === 0) warnings.push("No recent trades in the last 24h.");
  if (metrics.avgTradeSize < 10) warnings.push("Average trade size is too small to copy cleanly.");
  return warnings;
}

function inferStrategy(
  category: LeaderboardCategory,
  trades: UserActivity[],
  metrics: WalletProfile["metrics"]
): string[] {
  const titleText = trades.map((item) => `${item.title ?? ""} ${item.slug ?? ""}`).join(" ").toLowerCase();
  const hypotheses: string[] = [];

  if (metrics.tradeCount > 80 && metrics.roiOnVolume < 0.03) {
    hypotheses.push("Likely market making/scalping or high-turnover execution, not simple directional edge.");
  }
  if (metrics.concentration > 0.6) {
    hypotheses.push("Edge may be market-specific rather than transferable across the niche.");
  }
  if (category === "SPORTS") {
    hypotheses.push("Possible source: sportsbook odds comparison, lineup/injury feeds, or live-score latency.");
  }
  if (category === "CRYPTO") {
    hypotheses.push("Possible source: exchange price feeds, volatility model, or oracle-resolution mechanics.");
  }
  if (category === "POLITICS" || category === "MENTIONS") {
    hypotheses.push("Possible source: news monitoring, polling/modeling, or domain expertise. Treat rumor/insider risk carefully.");
  }
  if (category === "WEATHER") {
    hypotheses.push("Possible source: official weather/climate datasets and model updates.");
  }
  if (category === "ECONOMICS" || category === "FINANCE") {
    hypotheses.push("Possible source: scheduled releases, filings, macro models, or cross-market pricing.");
  }
  if (/lawsuit|sec|filing|earnings|ipo|merger|acquisition/.test(titleText)) {
    hypotheses.push("Activity touches corporate/legal events; confirm with official filings/news before copy-paper.");
  }
  if (/goal|nba|nfl|nhl|fifa|ufc|tennis|points|rebounds|assists/.test(titleText)) {
    hypotheses.push("Sports activity detected; compare against sharp books/live event feeds before following.");
  }
  if (hypotheses.length === 0) hypotheses.push("No strong source hypothesis from recent activity.");
  return hypotheses;
}
