import { CopyPaperEvaluator } from "../services/copyPaperEvaluator.js";
import { getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const limit = getNumberArg(args, "--limit", 500);
const json = hasFlag(args, "--json");
const { report, evaluated } = await new CopyPaperEvaluator().evaluate(limit);

if (json) {
  console.log(JSON.stringify({ report, evaluated }, null, 2));
} else {
  console.log("Copy-paper mark-to-market");
  console.table([{
    total: report.total,
    copied: report.copied,
    evaluated: report.evaluated,
    simulatedStake: report.simulatedStake.toFixed(2),
    mtmPnl: report.mtmPnl.toFixed(2),
    avgRoi: `${(report.avgRoi * 100).toFixed(2)}%`,
    winRate: `${(report.winRate * 100).toFixed(1)}%`
  }]);

  console.log("By wallet");
  console.table(
    report.byWallet.map((row) => ({
      category: row.category,
      user: row.userName ?? row.wallet.slice(0, 10),
      trades: row.trades,
      evaluated: row.evaluated,
      mtmPnl: row.mtmPnl.toFixed(2),
      avgRoi: `${(row.avgRoi * 100).toFixed(2)}%`,
      winRate: `${(row.winRate * 100).toFixed(1)}%`
    }))
  );

  console.log("Latest evaluated trades");
  console.table(
    evaluated.slice(0, 50).map((item) => ({
      status: item.trade.status,
      category: item.trade.category,
      user: item.trade.userName ?? item.trade.wallet.slice(0, 10),
      entry: item.trade.copyPrice?.toFixed(3) ?? "n/a",
      bid: item.currentBid?.toFixed(3) ?? "n/a",
      pnl: item.mtmPnl?.toFixed(2) ?? "n/a",
      roi: item.mtmRoi === undefined ? "n/a" : `${(item.mtmRoi * 100).toFixed(2)}%`,
      reason: item.reason ?? "",
      outcome: item.trade.outcome ?? "",
      title: (item.trade.title ?? item.trade.slug ?? "").slice(0, 80)
    }))
  );
}
