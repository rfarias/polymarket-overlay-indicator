import { BtcUpdownReplayService, SetupBucket } from "../services/btcUpdownReplay.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const wallet = getArgValue(args, "--wallet");
if (!wallet) throw new Error("Missing --wallet 0x...");

const limit = getNumberArg(args, "--limit", 500);
const minTrades = getNumberArg(args, "--min-trades", 3);
const json = hasFlag(args, "--json");

const report = await new BtcUpdownReplayService().mineSetups(wallet, limit, minTrades);

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("BTC Up/Down setup miner");
  console.table([{
    wallet: report.wallet,
    windows: report.sourceWindows,
    sourceTrades: report.sourceTrades,
    eligibleTrades: report.eligibleTrades,
    skippedTrades: report.skippedTrades,
    stake: report.totalStake.toFixed(2),
    pnl: report.totalPnl.toFixed(2),
    roi: `${(report.totalRoi * 100).toFixed(2)}%`,
    minTrades
  }]);

  printBuckets("Best setup buckets", report.bestSetups);
  printBuckets("Worst setup buckets", report.worstSetups);
  printBuckets("By action", report.byAction);
  printBuckets("By seconds to end", report.byTime);
  printBuckets("By contract price", report.byPrice);
  printBuckets("By BTC move from start", report.byMove);
}

function printBuckets(title: string, buckets: SetupBucket[]): void {
  console.log(title);
  console.table(
    buckets.slice(0, 20).map((bucket) => ({
      key: bucket.key,
      trades: bucket.trades,
      windows: bucket.windows,
      stake: bucket.stake.toFixed(2),
      pnl: bucket.pnl.toFixed(2),
      roi: `${(bucket.roi * 100).toFixed(1)}%`,
      winRate: `${(bucket.winRate * 100).toFixed(1)}%`,
      avgPrice: bucket.avgPrice.toFixed(3),
      avgAbsMoveBps: bucket.avgAbsMoveBps.toFixed(1)
    }))
  );
}
