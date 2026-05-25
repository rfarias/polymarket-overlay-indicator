import { BinaryArbService } from "../services/binaryArbService.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const wallet = getArgValue(args, "--wallet");
if (!wallet) throw new Error("Missing --wallet 0x...");

const limit = getNumberArg(args, "--limit", 500);
const maxPairSeconds = getNumberArg(args, "--max-pair-secs", 20);
const json = hasFlag(args, "--json");

const report = await new BinaryArbService().auditWallet(wallet, limit, maxPairSeconds);

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Wallet binary-arb audit");
  console.table([{
    wallet: report.wallet,
    sourceTrades: report.sourceTrades,
    buyTrades: report.buyTrades,
    candidatePairs: report.candidatePairs,
    profitablePairs: report.profitablePairs,
    pairedShares: report.totalPairedShares.toFixed(2),
    lockedProfit: report.estimatedLockedProfit.toFixed(4),
    avgSecondsBetween: report.avgSecondsBetween.toFixed(2),
    avgEdgeTicks: report.avgEdgeTicks.toFixed(2)
  }]);

  console.log("Profitable paired fills");
  console.table(
    report.pairs.slice(0, 80).map((pair) => ({
      title: pair.title.slice(0, 48),
      firstTime: pair.firstTime,
      seconds: pair.secondsBetween,
      up: pair.upPrice.toFixed(3),
      down: pair.downPrice.toFixed(3),
      sum: pair.sumPrice.toFixed(3),
      edgeTicks: pair.edgeTicks,
      shares: pair.pairedShares.toFixed(2),
      lockedProfit: pair.estimatedLockedProfit.toFixed(4)
    }))
  );
}
