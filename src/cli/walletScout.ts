import { DataApiClient, LeaderboardCategory, LeaderboardPeriod } from "../polymarket/dataApiClient.js";
import { buildWalletProfile } from "../services/walletIntelligence.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const categories = (getArgValue(args, "--categories", "SPORTS,CRYPTO,POLITICS,WEATHER,ECONOMICS,TECH,FINANCE")!)
  .split(",")
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean) as LeaderboardCategory[];
const period = (getArgValue(args, "--period", "MONTH")!.toUpperCase() as LeaderboardPeriod);
const limit = getNumberArg(args, "--limit", 10);
const activityLimit = getNumberArg(args, "--activity-limit", 100);
const json = hasFlag(args, "--json");

const data = new DataApiClient();
const profiles = [];

for (const category of categories) {
  const leaders = await data.leaderboard({ category, timePeriod: period, orderBy: "PNL", limit });
  for (const trader of leaders) {
    try {
      const activity = await data.activity({ user: trader.proxyWallet, type: "TRADE", limit: activityLimit });
      profiles.push(buildWalletProfile(category, trader, activity));
    } catch (error) {
      console.error(`Failed to fetch activity for ${trader.proxyWallet}:`, error);
    }
  }
}

profiles.sort((a, b) => b.qualityScore - a.qualityScore);

if (json) {
  console.log(JSON.stringify(profiles, null, 2));
} else {
  console.log("Wallet scout");
  console.table(
    profiles.slice(0, 80).map((profile) => ({
      category: profile.category,
      score: profile.qualityScore,
      risk: profile.copyRisk,
      rank: profile.trader.rank,
      user: profile.trader.userName ?? profile.trader.proxyWallet.slice(0, 10),
      wallet: profile.trader.proxyWallet.slice(0, 10),
      pnl: profile.metrics.pnl.toFixed(2),
      volume: profile.metrics.volume.toFixed(0),
      roiVol: `${(profile.metrics.roiOnVolume * 100).toFixed(2)}%`,
      trades: profile.metrics.tradeCount,
      markets: profile.metrics.uniqueMarkets,
      recent24h: profile.metrics.recentTrades24h,
      concentration: `${(profile.metrics.concentration * 100).toFixed(0)}%`,
      warnings: profile.warnings.join(" | "),
      hypothesis: profile.strategyHypothesis[0]
    }))
  );

  console.log("Copy-paper candidates from top profiles");
  console.table(
    profiles
      .filter((profile) => profile.copyRisk !== "HIGH" && profile.copyPaperCandidates.length > 0)
      .slice(0, 20)
      .flatMap((profile) =>
        profile.copyPaperCandidates.slice(0, 3).map((candidate) => ({
          category: profile.category,
          score: profile.qualityScore,
          user: profile.trader.userName ?? profile.trader.proxyWallet.slice(0, 10),
          time: new Date(candidate.timestamp * 1000).toISOString(),
          side: candidate.side,
          price: candidate.price.toFixed(3),
          size: candidate.usdcSize.toFixed(2),
          outcome: candidate.outcome ?? "",
          title: (candidate.title ?? candidate.slug ?? "").slice(0, 90)
        }))
      )
  );
}
