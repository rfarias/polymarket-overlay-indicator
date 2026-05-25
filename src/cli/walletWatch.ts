import { CopyPaperService, CopyWatchOptions } from "../services/copyPaperService.js";
import { LeaderboardCategory, LeaderboardPeriod } from "../polymarket/dataApiClient.js";
import { getArgValue, getNumberArg } from "../utils/args.js";

const args = process.argv.slice(2);
const intervalSeconds = getNumberArg(args, "--interval-secs", 15);
const runs = getNumberArg(args, "--runs", Number.POSITIVE_INFINITY);
const options: CopyWatchOptions = {
  categories: getArgValue(args, "--categories", "SPORTS,CRYPTO")!
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean) as LeaderboardCategory[],
  period: getArgValue(args, "--period", "WEEK")!.toUpperCase() as LeaderboardPeriod,
  leaderboardLimit: getNumberArg(args, "--limit", 5),
  activityLimit: getNumberArg(args, "--activity-limit", 50),
  minScore: getNumberArg(args, "--min-score", 80),
  minTradeUsdc: getNumberArg(args, "--min-trade-usdc", 50),
  stake: getNumberArg(args, "--stake", 10),
  maxWorsePrice: getNumberArg(args, "--max-worse-price", 0.03),
  minDelaySeconds: getNumberArg(args, "--min-delay-secs", 10),
  maxTradeAgeSeconds: getNumberArg(args, "--max-trade-age-secs", 300)
};

const service = new CopyPaperService();
let completed = 0;

while (completed < runs) {
  const startedAt = new Date().toISOString();
  try {
    const result = await service.runOnce(options);
    console.log(
      [
        `[${new Date().toISOString()}]`,
        `run=${completed + 1}`,
        `profiles=${result.profiles}`,
        `observed=${result.observedTrades}`,
        `copied=${result.copied}`,
        `skipped=${result.skipped}`,
        `reasons=${JSON.stringify(result.reasons)}`
      ].join(" ")
    );
  } catch (error) {
    console.error(`[${startedAt}] wallet-watch failed`, error);
  }

  completed += 1;
  if (completed >= runs) break;
  await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
}
