import { createClient, Client } from "@libsql/client";
import { config } from "../config.js";

let client: Client | undefined;

export function getDb(): Client {
  client ??= createClient({ url: config.databaseUrl });
  return client;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.batch([
    `CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      suggestion TEXT,
      net_edge REAL,
      confidence REAL,
      risk REAL,
      source_type TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS paper_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      fair REAL NOT NULL,
      stake REAL NOT NULL,
      net_edge REAL NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tracked_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      wallet TEXT NOT NULL,
      user_name TEXT,
      rank TEXT,
      pnl REAL NOT NULL,
      volume REAL NOT NULL,
      quality_score INTEGER NOT NULL,
      copy_risk TEXT NOT NULL,
      metrics TEXT NOT NULL,
      warnings TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      UNIQUE(category, wallet)
    )`,
    `CREATE TABLE IF NOT EXISTS observed_wallet_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      wallet TEXT NOT NULL,
      user_name TEXT,
      score INTEGER NOT NULL,
      copy_risk TEXT NOT NULL,
      side TEXT,
      asset TEXT,
      outcome TEXT,
      price REAL NOT NULL,
      size REAL NOT NULL,
      usdc_size REAL NOT NULL,
      slug TEXT,
      title TEXT,
      transaction_hash TEXT,
      wallet_trade_time TEXT NOT NULL,
      observed_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS copy_paper_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observed_trade_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      wallet TEXT NOT NULL,
      user_name TEXT,
      asset TEXT,
      outcome TEXT,
      wallet_price REAL NOT NULL,
      copy_price REAL,
      stake REAL NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      quote_bid REAL,
      quote_ask REAL,
      quote_spread REAL,
      slug TEXT,
      title TEXT,
      wallet_trade_time TEXT NOT NULL,
      copied_at TEXT NOT NULL,
      FOREIGN KEY(observed_trade_id) REFERENCES observed_wallet_trades(id)
    )`
  ]);

  const columns = await db.execute("PRAGMA table_info(snapshots)");
  const existing = new Set(columns.rows.map((row) => String(row.name)));
  const additions = [
    ["suggestion", "TEXT"],
    ["net_edge", "REAL"],
    ["confidence", "REAL"],
    ["risk", "REAL"],
    ["source_type", "TEXT"]
  ] as const;

  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      await db.execute(`ALTER TABLE snapshots ADD COLUMN ${name} ${type}`);
    }
  }
}
