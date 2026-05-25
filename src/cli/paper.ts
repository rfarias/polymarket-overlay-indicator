import { buildEvaluatedPaperReport, evaluatePaperTrades } from "../paper/backtester.js";
import { SnapshotsRepo } from "../storage/snapshotsRepo.js";
import { getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const limit = getNumberArg(args, "--limit", 500);
const json = hasFlag(args, "--json");
const repo = new SnapshotsRepo();
const trades = await repo.listPaperTrades(limit);
const snapshotsByMarket = new Map();

for (const trade of trades) {
  if (!snapshotsByMarket.has(trade.marketId)) {
    snapshotsByMarket.set(
      trade.marketId,
      await repo.listOpportunitiesForMarketSince(trade.marketId, trade.createdAt)
    );
  }
}

const evaluated = evaluatePaperTrades(trades, snapshotsByMarket);
const report = buildEvaluatedPaperReport(evaluated);

if (json) {
  console.log(JSON.stringify({ report, evaluated }, null, 2));
} else {
  console.log("Paper mark-to-market");
  console.table([{
    signals: report.totalSignals,
    evaluated: report.evaluatedSignals ?? 0,
    stakeUsd: trades[0]?.stake ?? 0,
    totalStake: report.simulatedStake,
    mtmPnl: report.totalMtmPnl?.toFixed(2) ?? "0.00",
    avgRoi: `${(((report.averageMtmRoi ?? 0) * 100)).toFixed(2)}%`,
    winRate: `${(((report.winRate ?? 0) * 100)).toFixed(1)}%`,
    maxRunup: report.maxRunupPerTrade?.toFixed(2) ?? "0.00",
    maxDrawdown: report.maxDrawdownPerTrade?.toFixed(2) ?? "0.00",
    significance: report.significance ?? "n/a"
  }]);

  console.log("Ultimas entradas avaliadas");
  console.table(
    evaluated.slice(0, 30).map((item) => ({
      createdAt: item.trade.createdAt,
      side: item.trade.side,
      entry: item.trade.price.toFixed(4),
      latest: item.latestPrice?.toFixed(4) ?? "n/a",
      stake: item.trade.stake.toFixed(2),
      pnl: item.mtmPnl?.toFixed(2) ?? "n/a",
      roi: item.mtmRoi === undefined ? "n/a" : `${(item.mtmRoi * 100).toFixed(2)}%`,
      observations: item.observations,
      slug: item.trade.slug.slice(0, 70)
    }))
  );
}
