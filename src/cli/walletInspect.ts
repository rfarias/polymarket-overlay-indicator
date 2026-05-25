import { DataApiClient, LeaderboardTrader } from "../polymarket/dataApiClient.js";
import { buildWalletProfile } from "../services/walletIntelligence.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const wallet = getArgValue(args, "--wallet");
if (!wallet) {
  throw new Error("Missing --wallet 0x...");
}

const userName = getArgValue(args, "--name", wallet.slice(0, 10));
const activityLimit = getNumberArg(args, "--activity-limit", 200);
const positionsLimit = getNumberArg(args, "--positions-limit", 100);
const json = hasFlag(args, "--json");
const data = new DataApiClient();

const [activity, positions] = await Promise.all([
  data.activity({ user: wallet, type: "TRADE", limit: activityLimit }),
  data.positions({ user: wallet, limit: positionsLimit })
]);

const volume = activity.reduce((sum, item) => sum + item.usdcSize, 0);
const pnl = positions.reduce((sum, item) => sum + item.cashPnl + item.realizedPnl, 0);
const trader: LeaderboardTrader = {
  rank: "direct",
  proxyWallet: wallet,
  userName,
  vol: volume,
  pnl
};
const profile = buildWalletProfile("OVERALL", trader, activity);
const openValue = positions.reduce((sum, item) => sum + item.currentValue, 0);
const openInitial = positions.reduce((sum, item) => sum + item.initialValue, 0);
const openPnl = positions.reduce((sum, item) => sum + item.cashPnl, 0);
const realizedPnl = positions.reduce((sum, item) => sum + item.realizedPnl, 0);

const byMarket = new Map<string, { title: string; trades: number; usdc: number }>();
for (const trade of activity) {
  const key = trade.slug ?? trade.conditionId ?? "unknown";
  const current = byMarket.get(key) ?? { title: trade.title ?? key, trades: 0, usdc: 0 };
  current.trades += 1;
  current.usdc += trade.usdcSize;
  byMarket.set(key, current);
}

if (json) {
  console.log(JSON.stringify({ profile, positions, activity }, null, 2));
} else {
  console.log("Wallet inspect");
  console.table([{
    wallet,
    userName,
    qualityScore: profile.qualityScore,
    copyRisk: profile.copyRisk,
    trades: profile.metrics.tradeCount,
    uniqueMarkets: profile.metrics.uniqueMarkets,
    recent24h: profile.metrics.recentTrades24h,
    activityVolume: volume.toFixed(2),
    openPositions: positions.length,
    openInitial: openInitial.toFixed(2),
    openValue: openValue.toFixed(2),
    openPnl: openPnl.toFixed(2),
    realizedPnl: realizedPnl.toFixed(2),
    totalPositionPnl: pnl.toFixed(2)
  }]);

  console.log("Hypotheses");
  console.table(profile.strategyHypothesis.map((hypothesis) => ({ hypothesis })));

  console.log("Warnings");
  console.table(profile.warnings.map((warning) => ({ warning })));

  console.log("Top recent markets by activity");
  console.table(
    Array.from(byMarket.values())
      .sort((a, b) => b.usdc - a.usdc)
      .slice(0, 20)
      .map((item) => ({
        trades: item.trades,
        usdc: item.usdc.toFixed(2),
        title: item.title.slice(0, 90)
      }))
  );

  console.log("Open positions");
  console.table(
    positions.slice(0, 30).map((position) => ({
      value: position.currentValue.toFixed(2),
      pnl: position.cashPnl.toFixed(2),
      pnlPct: `${position.percentPnl.toFixed(2)}%`,
      avg: position.avgPrice.toFixed(3),
      cur: position.curPrice.toFixed(3),
      outcome: position.outcome ?? "",
      title: (position.title ?? position.slug ?? "").slice(0, 90)
    }))
  );

  console.log("Recent trades");
  console.table(
    activity.slice(0, 40).map((trade) => ({
      time: new Date(trade.timestamp * 1000).toISOString(),
      side: trade.side ?? "",
      price: trade.price.toFixed(3),
      usdc: trade.usdcSize.toFixed(2),
      outcome: trade.outcome ?? "",
      title: (trade.title ?? trade.slug ?? "").slice(0, 90)
    }))
  );
}
