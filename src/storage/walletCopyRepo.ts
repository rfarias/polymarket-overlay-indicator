import { WalletProfile } from "../services/walletIntelligence.js";
import { UserActivity } from "../polymarket/dataApiClient.js";
import { getDb, initDb } from "./db.js";

export interface ObservedWalletTradeRecord {
  id: number;
  tradeKey: string;
  category: string;
  wallet: string;
  userName?: string;
  score: number;
  copyRisk: string;
  side?: string;
  asset?: string;
  outcome?: string;
  price: number;
  size: number;
  usdcSize: number;
  slug?: string;
  title?: string;
  transactionHash?: string;
  walletTradeTime: string;
  observedAt: string;
}

export interface CopyPaperTradeRecord {
  id: number;
  observedTradeId: number;
  category: string;
  wallet: string;
  userName?: string;
  asset?: string;
  outcome?: string;
  walletPrice: number;
  copyPrice?: number;
  stake: number;
  status: "COPIED" | "SKIPPED";
  reason: string;
  quoteBid?: number;
  quoteAsk?: number;
  quoteSpread?: number;
  slug?: string;
  title?: string;
  walletTradeTime: string;
  copiedAt: string;
}

export class WalletCopyRepo {
  async upsertWallet(profile: WalletProfile): Promise<void> {
    await initDb();
    await getDb().execute({
      sql: `INSERT INTO tracked_wallets
        (category, wallet, user_name, rank, pnl, volume, quality_score, copy_risk, metrics, warnings, hypothesis, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(category, wallet) DO UPDATE SET
          user_name = excluded.user_name,
          rank = excluded.rank,
          pnl = excluded.pnl,
          volume = excluded.volume,
          quality_score = excluded.quality_score,
          copy_risk = excluded.copy_risk,
          metrics = excluded.metrics,
          warnings = excluded.warnings,
          hypothesis = excluded.hypothesis,
          observed_at = excluded.observed_at`,
      args: [
        profile.category,
        profile.trader.proxyWallet,
        profile.trader.userName ?? null,
        profile.trader.rank,
        profile.metrics.pnl,
        profile.metrics.volume,
        profile.qualityScore,
        profile.copyRisk,
        JSON.stringify(profile.metrics),
        JSON.stringify(profile.warnings),
        JSON.stringify(profile.strategyHypothesis),
        new Date().toISOString()
      ]
    });
  }

  async insertObservedTrade(profile: WalletProfile, trade: UserActivity): Promise<ObservedWalletTradeRecord | undefined> {
    await initDb();
    const tradeKey = buildTradeKey(profile.trader.proxyWallet, trade);
    const existing = await this.getObservedTradeByKey(tradeKey);
    if (existing) return undefined;

    const walletTradeTime = new Date(trade.timestamp * 1000).toISOString();
    const observedAt = new Date().toISOString();
    await getDb().execute({
      sql: `INSERT INTO observed_wallet_trades
        (trade_key, category, wallet, user_name, score, copy_risk, side, asset, outcome, price, size, usdc_size,
         slug, title, transaction_hash, wallet_trade_time, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        tradeKey,
        profile.category,
        profile.trader.proxyWallet,
        profile.trader.userName ?? null,
        profile.qualityScore,
        profile.copyRisk,
        trade.side ?? null,
        trade.asset ?? null,
        trade.outcome ?? null,
        trade.price,
        trade.size,
        trade.usdcSize,
        trade.slug ?? null,
        trade.title ?? null,
        trade.transactionHash ?? null,
        walletTradeTime,
        observedAt
      ]
    });

    return this.getObservedTradeByKey(tradeKey);
  }

  async insertCopyPaperTrade(input: Omit<CopyPaperTradeRecord, "id">): Promise<void> {
    await initDb();
    await getDb().execute({
      sql: `INSERT INTO copy_paper_trades
        (observed_trade_id, category, wallet, user_name, asset, outcome, wallet_price, copy_price, stake, status,
         reason, quote_bid, quote_ask, quote_spread, slug, title, wallet_trade_time, copied_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.observedTradeId,
        input.category,
        input.wallet,
        input.userName ?? null,
        input.asset ?? null,
        input.outcome ?? null,
        input.walletPrice,
        input.copyPrice ?? null,
        input.stake,
        input.status,
        input.reason,
        input.quoteBid ?? null,
        input.quoteAsk ?? null,
        input.quoteSpread ?? null,
        input.slug ?? null,
        input.title ?? null,
        input.walletTradeTime,
        input.copiedAt
      ]
    });
  }

  async hasCopyForObservedTrade(observedTradeId: number): Promise<boolean> {
    await initDb();
    const result = await getDb().execute({
      sql: "SELECT COUNT(*) AS total FROM copy_paper_trades WHERE observed_trade_id = ?",
      args: [observedTradeId]
    });
    return Number(result.rows[0]?.total ?? 0) > 0;
  }

  async listCopyPaperTrades(limit = 200): Promise<CopyPaperTradeRecord[]> {
    await initDb();
    const result = await getDb().execute({
      sql: `SELECT * FROM copy_paper_trades ORDER BY id DESC LIMIT ?`,
      args: [limit]
    });
    return result.rows.map((row) => ({
      id: Number(row.id),
      observedTradeId: Number(row.observed_trade_id),
      category: String(row.category),
      wallet: String(row.wallet),
      userName: row.user_name ? String(row.user_name) : undefined,
      asset: row.asset ? String(row.asset) : undefined,
      outcome: row.outcome ? String(row.outcome) : undefined,
      walletPrice: Number(row.wallet_price),
      copyPrice: row.copy_price === null ? undefined : Number(row.copy_price),
      stake: Number(row.stake),
      status: row.status as CopyPaperTradeRecord["status"],
      reason: String(row.reason),
      quoteBid: row.quote_bid === null ? undefined : Number(row.quote_bid),
      quoteAsk: row.quote_ask === null ? undefined : Number(row.quote_ask),
      quoteSpread: row.quote_spread === null ? undefined : Number(row.quote_spread),
      slug: row.slug ? String(row.slug) : undefined,
      title: row.title ? String(row.title) : undefined,
      walletTradeTime: String(row.wallet_trade_time),
      copiedAt: String(row.copied_at)
    }));
  }

  private async getObservedTradeByKey(tradeKey: string): Promise<ObservedWalletTradeRecord | undefined> {
    const result = await getDb().execute({
      sql: "SELECT * FROM observed_wallet_trades WHERE trade_key = ?",
      args: [tradeKey]
    });
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: Number(row.id),
      tradeKey: String(row.trade_key),
      category: String(row.category),
      wallet: String(row.wallet),
      userName: row.user_name ? String(row.user_name) : undefined,
      score: Number(row.score),
      copyRisk: String(row.copy_risk),
      side: row.side ? String(row.side) : undefined,
      asset: row.asset ? String(row.asset) : undefined,
      outcome: row.outcome ? String(row.outcome) : undefined,
      price: Number(row.price),
      size: Number(row.size),
      usdcSize: Number(row.usdc_size),
      slug: row.slug ? String(row.slug) : undefined,
      title: row.title ? String(row.title) : undefined,
      transactionHash: row.transaction_hash ? String(row.transaction_hash) : undefined,
      walletTradeTime: String(row.wallet_trade_time),
      observedAt: String(row.observed_at)
    };
  }
}

function buildTradeKey(wallet: string, trade: UserActivity): string {
  return [
    wallet.toLowerCase(),
    trade.transactionHash ?? "nohash",
    trade.timestamp,
    trade.asset ?? "noasset",
    trade.side ?? "noside",
    trade.price,
    trade.usdcSize
  ].join(":");
}
