import { WalletCopyRepo } from "../storage/walletCopyRepo.js";
import { getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const limit = getNumberArg(args, "--limit", 200);
const json = hasFlag(args, "--json");
const trades = await new WalletCopyRepo().listCopyPaperTrades(limit);
const copied = trades.filter((trade) => trade.status === "COPIED");
const skipped = trades.filter((trade) => trade.status === "SKIPPED");
const avgSlippage = copied.length
  ? copied.reduce((sum, trade) => sum + ((trade.copyPrice ?? trade.walletPrice) - trade.walletPrice), 0) / copied.length
  : 0;

if (json) {
  console.log(JSON.stringify({ trades }, null, 2));
} else {
  console.log("Copy-paper report");
  console.table([{
    total: trades.length,
    copied: copied.length,
    skipped: skipped.length,
    simulatedStake: copied.reduce((sum, trade) => sum + trade.stake, 0),
    avgSlippage: avgSlippage.toFixed(4)
  }]);

  console.log("Reasons");
  console.table(Object.fromEntries(
    trades.reduce((map, trade) => map.set(trade.reason, (map.get(trade.reason) ?? 0) + 1), new Map<string, number>())
  ));

  console.log("Latest copy-paper trades");
  console.table(
    trades.slice(0, 50).map((trade) => ({
      status: trade.status,
      reason: trade.reason,
      category: trade.category,
      user: trade.userName ?? trade.wallet.slice(0, 10),
      walletPrice: trade.walletPrice.toFixed(3),
      copyPrice: trade.copyPrice?.toFixed(3) ?? "n/a",
      stake: trade.stake,
      outcome: trade.outcome ?? "",
      time: trade.copiedAt,
      title: (trade.title ?? trade.slug ?? "").slice(0, 80)
    }))
  );
}
