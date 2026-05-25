import { BtcUpdownReplayService } from "../services/btcUpdownReplay.js";
import { getArgValue, getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const wallet = getArgValue(args, "--wallet");
if (!wallet) throw new Error("Missing --wallet 0x...");
const limit = getNumberArg(args, "--limit", 300);
const json = hasFlag(args, "--json");
const report = await new BtcUpdownReplayService().replay(wallet, limit);

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("BTC Up/Down strategy replay");
  console.table([{
    wallet: report.wallet,
    windows: report.windows,
    resolved: report.resolvedWindows,
    cost: report.estimatedCost.toFixed(2),
    pnl: report.estimatedPnl.toFixed(2),
    roi: `${(report.estimatedRoi * 100).toFixed(2)}%`,
    winRate: `${(report.winRate * 100).toFixed(1)}%`,
    avgFirstSec: report.avgFirstTradeSecondsFromStart.toFixed(0),
    avgLastSecToEnd: report.avgLastTradeSecondsToEnd.toFixed(0),
    momentumTrades: report.momentumTrades,
    reversalTrades: report.reversalTrades,
    hedgeTrades: report.hedgeTrades
  }]);

  console.log("Windows");
  console.table(
    report.windowsDetail.slice(0, 40).map((window) => ({
      title: window.title.slice(0, 55),
      duration: `${window.durationMinutes}m`,
      result: window.result ?? "n/a",
      startSpot: window.startSpot?.toFixed(2) ?? "n/a",
      endSpot: window.endSpot?.toFixed(2) ?? "n/a",
      trades: window.tradeCount,
      upUsd: window.buyUpUsdc.toFixed(2),
      downUsd: window.buyDownUsdc.toFixed(2),
      hedge: `${(window.hedgeRatio * 100).toFixed(0)}%`,
      cost: window.cost.toFixed(2),
      pnl: window.estimatedPnl?.toFixed(2) ?? "n/a",
      roi: window.estimatedRoi === undefined ? "n/a" : `${(window.estimatedRoi * 100).toFixed(1)}%`,
      firstSec: window.firstTradeSecondsFromStart ?? "n/a",
      lastSecToEnd: window.lastTradeSecondsToEnd ?? "n/a",
      hypothesis: window.hypothesis.join(" ")
    }))
  );

  console.log("Recent trade replay");
  console.table(
    report.windowsDetail.slice(0, 8).flatMap((window) =>
      window.trades.map((trade) => ({
        window: window.title.slice(0, 35),
        time: trade.time,
        side: trade.side ?? "",
        outcome: trade.outcome ?? "",
        price: trade.price.toFixed(3),
        usdc: trade.usdcSize.toFixed(2),
        spot: trade.spotAtTrade?.toFixed(2) ?? "n/a",
        moveBps: trade.spotMoveFromStartBps?.toFixed(1) ?? "n/a",
        secToEnd: trade.secondsToEnd,
        class: trade.actionClass
      }))
    ).slice(0, 80)
  );
}
