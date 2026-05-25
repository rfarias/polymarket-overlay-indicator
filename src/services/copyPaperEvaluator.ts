import { ClobClient } from "../polymarket/clobClient.js";
import { CopyPaperTradeRecord, WalletCopyRepo } from "../storage/walletCopyRepo.js";

export interface EvaluatedCopyTrade {
  trade: CopyPaperTradeRecord;
  currentBid?: number;
  currentAsk?: number;
  currentValue?: number;
  mtmPnl?: number;
  mtmRoi?: number;
  reason?: string;
}

export interface CopyEvaluationReport {
  total: number;
  copied: number;
  evaluated: number;
  simulatedStake: number;
  mtmPnl: number;
  avgRoi: number;
  winRate: number;
  byWallet: Array<{
    wallet: string;
    userName?: string;
    category: string;
    trades: number;
    evaluated: number;
    mtmPnl: number;
    avgRoi: number;
    winRate: number;
  }>;
}

export class CopyPaperEvaluator {
  private readonly repo = new WalletCopyRepo();
  private readonly clob = new ClobClient();

  async evaluate(limit = 500): Promise<{
    report: CopyEvaluationReport;
    evaluated: EvaluatedCopyTrade[];
  }> {
    const trades = await this.repo.listCopyPaperTrades(limit);
    const evaluated: EvaluatedCopyTrade[] = [];

    for (const trade of trades) {
      if (trade.status !== "COPIED" || !trade.asset || trade.copyPrice === undefined) {
        evaluated.push({ trade, reason: "NOT_COPIED_OR_NO_ASSET" });
        continue;
      }

      try {
        const quote = await this.clob.getTokenQuote(trade.asset);
        const currentBid = quote.bestBid;
        if (currentBid === undefined) {
          evaluated.push({ trade, currentAsk: quote.bestAsk, reason: "NO_CURRENT_BID" });
          continue;
        }

        const shares = trade.stake / trade.copyPrice;
        const currentValue = shares * currentBid;
        const mtmPnl = currentValue - trade.stake;
        evaluated.push({
          trade,
          currentBid,
          currentAsk: quote.bestAsk,
          currentValue,
          mtmPnl,
          mtmRoi: mtmPnl / trade.stake
        });
      } catch {
        evaluated.push({ trade, reason: "QUOTE_FETCH_FAILED" });
      }
    }

    return {
      report: buildCopyEvaluationReport(evaluated),
      evaluated
    };
  }
}

function buildCopyEvaluationReport(evaluated: EvaluatedCopyTrade[]): CopyEvaluationReport {
  const copied = evaluated.filter((item) => item.trade.status === "COPIED");
  const withPnl = evaluated.filter((item) => item.mtmPnl !== undefined && item.mtmRoi !== undefined);
  const byWalletMap = new Map<string, EvaluatedCopyTrade[]>();

  for (const item of copied) {
    const key = `${item.trade.category}:${item.trade.wallet}`;
    byWalletMap.set(key, [...(byWalletMap.get(key) ?? []), item]);
  }

  const byWallet = Array.from(byWalletMap.values()).map((items) => {
    const first = items[0].trade;
    const walletPnl = items.filter((item) => item.mtmPnl !== undefined);
    const mtmPnl = walletPnl.reduce((sum, item) => sum + (item.mtmPnl ?? 0), 0);
    const avgRoi = walletPnl.length
      ? walletPnl.reduce((sum, item) => sum + (item.mtmRoi ?? 0), 0) / walletPnl.length
      : 0;
    const wins = walletPnl.filter((item) => (item.mtmPnl ?? 0) > 0).length;
    return {
      wallet: first.wallet,
      userName: first.userName,
      category: first.category,
      trades: items.length,
      evaluated: walletPnl.length,
      mtmPnl,
      avgRoi,
      winRate: walletPnl.length ? wins / walletPnl.length : 0
    };
  }).sort((a, b) => b.mtmPnl - a.mtmPnl);

  const mtmPnl = withPnl.reduce((sum, item) => sum + (item.mtmPnl ?? 0), 0);
  const avgRoi = withPnl.length
    ? withPnl.reduce((sum, item) => sum + (item.mtmRoi ?? 0), 0) / withPnl.length
    : 0;
  const wins = withPnl.filter((item) => (item.mtmPnl ?? 0) > 0).length;

  return {
    total: evaluated.length,
    copied: copied.length,
    evaluated: withPnl.length,
    simulatedStake: copied.reduce((sum, item) => sum + item.trade.stake, 0),
    mtmPnl,
    avgRoi,
    winRate: withPnl.length ? wins / withPnl.length : 0,
    byWallet
  };
}
