import { Opportunity } from "../types.js";
import { PaperTrade } from "../paper/paperTrader.js";
import { getDb, initDb } from "./db.js";

export class SnapshotsRepo {
  async saveOpportunity(opportunity: Opportunity): Promise<void> {
    await initDb();
    const payload = {
      ...opportunity,
      market: {
        ...opportunity.market,
        raw: undefined
      }
    };
    await getDb().execute({
      sql: `INSERT INTO snapshots
        (market_id, slug, suggestion, net_edge, confidence, risk, source_type, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        opportunity.market.marketId,
        opportunity.market.slug,
        opportunity.suggestion,
        opportunity.netEdge ?? null,
        opportunity.confidence,
        opportunity.risk,
        opportunity.classification.type,
        JSON.stringify(payload),
        opportunity.createdAt
      ]
    });
  }

  async savePaperTrade(trade: PaperTrade): Promise<void> {
    await initDb();
    await getDb().execute({
      sql: `INSERT INTO paper_trades
        (market_id, slug, side, price, fair, stake, net_edge, status, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        trade.marketId,
        trade.slug,
        trade.side,
        trade.price,
        trade.fair,
        trade.stake,
        trade.netEdge,
        trade.status,
        trade.reason,
        trade.createdAt
      ]
    });
  }

  async listLatestOpportunities(limit = 100): Promise<Opportunity[]> {
    await initDb();
    const result = await getDb().execute({
      sql: "SELECT payload FROM snapshots ORDER BY id DESC LIMIT ?",
      args: [limit]
    });
    return result.rows.map((row) => JSON.parse(String(row.payload)) as Opportunity);
  }

  async listOpportunitiesForMarketSince(marketId: string, since: string, limit = 500): Promise<Opportunity[]> {
    await initDb();
    const result = await getDb().execute({
      sql: `SELECT payload FROM snapshots
        WHERE market_id = ? AND created_at > ?
        ORDER BY created_at ASC LIMIT ?`,
      args: [marketId, since, limit]
    });
    return result.rows.map((row) => JSON.parse(String(row.payload)) as Opportunity);
  }

  async countSnapshots(): Promise<number> {
    await initDb();
    const result = await getDb().execute("SELECT COUNT(*) AS total FROM snapshots");
    return Number(result.rows[0]?.total ?? 0);
  }

  async snapshotStats(): Promise<{
    total: number;
    firstCreatedAt?: string;
    lastCreatedAt?: string;
    bySuggestion: Record<string, number>;
    bySource: Record<string, number>;
  }> {
    await initDb();
    await this.backfillSnapshotMetadata();
    const [totalResult, suggestionResult, sourceResult] = await Promise.all([
      getDb().execute("SELECT COUNT(*) AS total, MIN(created_at) AS first_created_at, MAX(created_at) AS last_created_at FROM snapshots"),
      getDb().execute("SELECT COALESCE(suggestion, 'UNKNOWN') AS suggestion, COUNT(*) AS total FROM snapshots GROUP BY suggestion ORDER BY total DESC"),
      getDb().execute("SELECT COALESCE(source_type, 'UNKNOWN') AS source_type, COUNT(*) AS total FROM snapshots GROUP BY source_type ORDER BY total DESC")
    ]);

    return {
      total: Number(totalResult.rows[0]?.total ?? 0),
      firstCreatedAt: totalResult.rows[0]?.first_created_at ? String(totalResult.rows[0].first_created_at) : undefined,
      lastCreatedAt: totalResult.rows[0]?.last_created_at ? String(totalResult.rows[0].last_created_at) : undefined,
      bySuggestion: Object.fromEntries(
        suggestionResult.rows.map((row) => [String(row.suggestion), Number(row.total)])
      ),
      bySource: Object.fromEntries(
        sourceResult.rows.map((row) => [String(row.source_type), Number(row.total)])
      )
    };
  }

  async backfillSnapshotMetadata(limit = 5000): Promise<number> {
    await initDb();
    const result = await getDb().execute({
      sql: `SELECT id, payload FROM snapshots
        WHERE suggestion IS NULL OR source_type IS NULL OR confidence IS NULL OR risk IS NULL
        ORDER BY id DESC LIMIT ?`,
      args: [limit]
    });

    let updated = 0;
    for (const row of result.rows) {
      const id = Number(row.id);
      const opportunity = JSON.parse(String(row.payload)) as Opportunity;
      await getDb().execute({
        sql: `UPDATE snapshots
          SET suggestion = ?, net_edge = ?, confidence = ?, risk = ?, source_type = ?
          WHERE id = ?`,
        args: [
          opportunity.suggestion,
          opportunity.netEdge ?? null,
          opportunity.confidence,
          opportunity.risk,
          opportunity.classification.type,
          id
        ]
      });
      updated += 1;
    }

    return updated;
  }

  async listPaperTrades(limit = 500): Promise<PaperTrade[]> {
    await initDb();
    const result = await getDb().execute({
      sql: `SELECT id, market_id, slug, side, price, fair, stake, net_edge, status, reason, created_at
        FROM paper_trades ORDER BY id DESC LIMIT ?`,
      args: [limit]
    });

    return result.rows.map((row) => ({
      id: Number(row.id),
      marketId: String(row.market_id),
      slug: String(row.slug),
      side: row.side as PaperTrade["side"],
      price: Number(row.price),
      fair: Number(row.fair),
      stake: Number(row.stake),
      netEdge: Number(row.net_edge),
      status: row.status as PaperTrade["status"],
      reason: String(row.reason),
      createdAt: String(row.created_at)
    }));
  }

  async listLatestPaperTrades(limit = 100): Promise<PaperTrade[]> {
    return this.listPaperTrades(limit);
  }

  async hasOpenPaperTrade(marketId: string, side: PaperTrade["side"]): Promise<boolean> {
    await initDb();
    const result = await getDb().execute({
      sql: "SELECT COUNT(*) AS total FROM paper_trades WHERE market_id = ? AND side = ? AND status = 'OPEN'",
      args: [marketId, side]
    });
    return Number(result.rows[0]?.total ?? 0) > 0;
  }
}
