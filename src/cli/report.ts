import { buildPaperReport } from "../paper/backtester.js";
import { SnapshotsRepo } from "../storage/snapshotsRepo.js";
import { getNumberArg, hasFlag } from "../utils/args.js";

const repo = new SnapshotsRepo();
const args = process.argv.slice(2);
const limit = getNumberArg(args, "--limit", 100);
const trades = await repo.listPaperTrades(limit);
const snapshotStats = await repo.snapshotStats();
const paperReport = buildPaperReport(trades);

if (hasFlag(args, "--json")) {
  console.log(JSON.stringify({ snapshots: snapshotStats, paper: paperReport, trades }, null, 2));
} else {
  console.log("Base de coleta");
  console.table([{
    snapshots: snapshotStats.total,
    first: snapshotStats.firstCreatedAt ?? "n/a",
    last: snapshotStats.lastCreatedAt ?? "n/a",
    paperSignals: paperReport.totalSignals,
    openPaper: paperReport.openTrades,
    avgNetEdge: paperReport.averageNetEdge.toFixed(4),
    simulatedStake: paperReport.simulatedStake
  }]);

  console.log("Snapshots por sugestao");
  console.table(snapshotStats.bySuggestion);

  console.log("Snapshots por fonte");
  console.table(snapshotStats.bySource);

  console.log("Ultimos paper signals");
  console.table(
    trades.slice(0, 25).map((trade) => ({
      createdAt: trade.createdAt,
      side: trade.side,
      netEdge: trade.netEdge.toFixed(4),
      price: trade.price.toFixed(4),
      fair: trade.fair.toFixed(4),
      stake: trade.stake,
      status: trade.status,
      slug: trade.slug.slice(0, 60)
    }))
  );
}
