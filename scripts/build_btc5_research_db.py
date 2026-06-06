#!/usr/bin/env python3
"""
Cria uma base DuckDB consolidada para pesquisa BTC 5m.

Este script nao roda setup nem backtest. Ele normaliza os Parquets locais em
tabelas analiticas para permitir auditoria, importacao incremental e estudos
posteriores com amostra maior.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any

import duckdb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, help="Diretorio com _btc5_*.parquet")
    parser.add_argument("--output-db", default="data/research/btc5_research.duckdb")
    parser.add_argument("--audit-output", default="research-output/data-audit/btc5_research_audit.json")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    output_db = Path(args.output_db)
    audit_output = Path(args.audit_output)
    output_db.parent.mkdir(parents=True, exist_ok=True)
    audit_output.parent.mkdir(parents=True, exist_ok=True)

    paths = {
        "markets": sql_path(source_dir / "_btc5_markets.parquet"),
        "ob_filtered": sql_path(source_dir / "_btc5_ob_filtered.parquet"),
        "prices": sql_path(source_dir / "_btc5_prices.parquet"),
        "res_map": sql_path(source_dir / "_btc5_res_map.parquet"),
        "orderbook_raw": sql_path(source_dir / "_btc5_orderbook.parquet"),
    }

    con = duckdb.connect(str(output_db))
    con.execute("SET memory_limit='2GB'")
    con.execute("SET threads=2")

    create_schema(con)
    create_source_manifest(con, paths)
    create_market_tables(con, paths)
    create_orderbook_tables(con, paths)
    create_price_tables(con, paths)
    audit = collect_audit(con, output_db, source_dir)

    audit_output.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    write_markdown_audit(audit_output.with_suffix(".md"), audit)
    print(json.dumps({"ok": True, "db": str(output_db), "audit": str(audit_output), **audit["summary"]}, indent=2))


def create_schema(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA IF NOT EXISTS research")


def create_source_manifest(con: duckdb.DuckDBPyConnection, paths: dict[str, str]) -> None:
    con.execute("""
        CREATE OR REPLACE TABLE research.source_manifest (
            source_name VARCHAR,
            source_path VARCHAR,
            role VARCHAR,
            imported_at TIMESTAMP
        )
    """)
    rows = [
        ("local_markets", paths["markets"], "market metadata", "now"),
        ("local_orderbook_filtered", paths["ob_filtered"], "1s best bid by outcome for resolved markets", "now"),
        ("local_prices", paths["prices"], "historical UP/DOWN prices", "now"),
        ("local_resolution_map", paths["res_map"], "direct resolution map", "now"),
        ("local_orderbook_raw", paths["orderbook_raw"], "raw tick-level orderbook, not materialized by this script", "now"),
    ]
    con.executemany(
        "INSERT INTO research.source_manifest VALUES (?, ?, ?, current_timestamp)",
        [(name, path, role) for name, path, role, _ in rows],
    )


def create_market_tables(con: duckdb.DuckDBPyConnection, paths: dict[str, str]) -> None:
    con.execute(f"""
        CREATE OR REPLACE TABLE research.btc5_markets AS
        SELECT
            CAST(market_id AS VARCHAR) AS market_id,
            question,
            crypto,
            timeframe,
            CAST(volume AS DOUBLE) AS volume,
            CAST(resolution AS INTEGER) AS resolution,
            CASE
                WHEN CAST(resolution AS INTEGER) = 1 THEN 'UP'
                WHEN CAST(resolution AS INTEGER) = 0 THEN 'DOWN'
                ELSE 'PENDING'
            END AS result,
            CAST(start_ts AS BIGINT) AS start_ts,
            CAST(end_ts AS BIGINT) AS end_ts,
            CAST(closed_ts AS BIGINT) AS closed_ts,
            condition_id,
            CAST(up_token_id AS VARCHAR) AS up_token_id,
            CAST(down_token_id AS VARCHAR) AS down_token_id,
            slug,
            CAST(fee_rate_bps AS INTEGER) AS fee_rate_bps
        FROM read_parquet('{paths["markets"]}')
    """)
    con.execute("""
        CREATE OR REPLACE TABLE research.btc5_markets_resolved AS
        SELECT *
        FROM research.btc5_markets
        WHERE resolution IN (0, 1)
    """)


def create_orderbook_tables(con: duckdb.DuckDBPyConnection, paths: dict[str, str]) -> None:
    con.execute(f"""
        CREATE OR REPLACE TABLE research.btc5_orderbook_1s AS
        SELECT
            CAST(market_id AS VARCHAR) AS market_id,
            lower(outcome) AS outcome,
            CAST(ts_sec AS BIGINT) AS ts_sec,
            CAST(best_bid AS DOUBLE) AS best_bid
        FROM read_parquet('{paths["ob_filtered"]}')
    """)
    con.execute("""
        CREATE OR REPLACE TABLE research.btc5_odds_1s AS
        WITH pivoted AS (
            SELECT
                market_id,
                ts_sec,
                MAX(CASE WHEN outcome = 'up' THEN best_bid END) AS up_bid,
                MAX(CASE WHEN outcome = 'down' THEN best_bid END) AS down_bid
            FROM research.btc5_orderbook_1s
            GROUP BY market_id, ts_sec
        )
        SELECT
            p.market_id,
            p.ts_sec,
            p.ts_sec * 1000 AS time_ms,
            p.up_bid,
            CASE WHEN p.down_bid IS NULL THEN NULL ELSE greatest(0.01, least(0.99, 1 - p.down_bid)) END AS up_ask,
            p.down_bid,
            CASE WHEN p.up_bid IS NULL THEN NULL ELSE greatest(0.01, least(0.99, 1 - p.up_bid)) END AS down_ask,
            m.result,
            m.start_ts,
            m.end_ts,
            (m.end_ts - p.ts_sec) AS seconds_remaining,
            'book_inferred_ask' AS source
        FROM pivoted p
        JOIN research.btc5_markets_resolved m ON p.market_id = m.market_id
        WHERE p.ts_sec BETWEEN m.start_ts AND m.end_ts
    """)


def create_price_tables(con: duckdb.DuckDBPyConnection, paths: dict[str, str]) -> None:
    con.execute(f"""
        CREATE OR REPLACE TABLE research.btc5_prices AS
        SELECT
            CAST(market_id AS VARCHAR) AS market_id,
            CAST(timestamp AS BIGINT) AS ts_sec,
            CAST(timestamp * 1000 AS BIGINT) AS time_ms,
            CAST(up_price AS DOUBLE) AS up_price,
            CAST(down_price AS DOUBLE) AS down_price,
            CAST(sum_prices AS DOUBLE) AS sum_prices
        FROM read_parquet('{paths["prices"]}')
    """)


def collect_audit(con: duckdb.DuckDBPyConnection, output_db: Path, source_dir: Path) -> dict[str, Any]:
    summary = one(con, """
        SELECT
            (SELECT COUNT(*) FROM research.btc5_markets) AS markets_total,
            (SELECT COUNT(*) FROM research.btc5_markets_resolved) AS markets_resolved,
            (SELECT COUNT(*) FROM research.btc5_orderbook_1s) AS orderbook_rows,
            (SELECT COUNT(DISTINCT market_id) FROM research.btc5_orderbook_1s) AS orderbook_markets,
            (SELECT COUNT(*) FROM research.btc5_odds_1s) AS odds_rows,
            (SELECT COUNT(DISTINCT market_id) FROM research.btc5_odds_1s) AS odds_markets,
            (SELECT COUNT(*) FROM research.btc5_prices) AS price_rows,
            (SELECT COUNT(DISTINCT market_id) FROM research.btc5_prices) AS price_markets
    """)
    resolution = many(con, """
        SELECT result, COUNT(*) AS markets
        FROM research.btc5_markets
        GROUP BY result
        ORDER BY result
    """)
    time_span = one(con, """
        SELECT
            MIN(start_ts) AS min_start_ts,
            MAX(end_ts) AS max_end_ts,
            MIN(start_ts) AS min_start_utc,
            MAX(end_ts) AS max_end_utc
        FROM research.btc5_markets
    """)
    if time_span.get("min_start_utc") is not None:
        time_span["min_start_utc"] = utc_iso(int(time_span["min_start_utc"]))
    if time_span.get("max_end_utc") is not None:
        time_span["max_end_utc"] = utc_iso(int(time_span["max_end_utc"]))
    odds_by_seconds = many(con, """
        SELECT
            CASE
                WHEN seconds_remaining BETWEEN 180 AND 240 THEN '180-240'
                WHEN seconds_remaining BETWEEN 120 AND 179 THEN '120-180'
                WHEN seconds_remaining BETWEEN 90 AND 119 THEN '90-120'
                WHEN seconds_remaining BETWEEN 60 AND 89 THEN '60-90'
                WHEN seconds_remaining BETWEEN 30 AND 59 THEN '30-60'
                WHEN seconds_remaining BETWEEN 15 AND 29 THEN '15-30'
                WHEN seconds_remaining BETWEEN 5 AND 14 THEN '5-15'
                ELSE 'outside'
            END AS seconds_band,
            COUNT(*) AS rows,
            COUNT(DISTINCT market_id) AS markets
        FROM research.btc5_odds_1s
        GROUP BY seconds_band
        ORDER BY seconds_band
    """)
    return {
        "database": str(output_db),
        "sourceDir": str(source_dir),
        "summary": summary,
        "resolution": resolution,
        "timeSpan": time_span,
        "oddsBySecondsBand": odds_by_seconds,
        "notes": [
            "This database is a consolidation layer, not a setup result.",
            "Ask prices in research.btc5_odds_1s are inferred from complementary best bids.",
            "Price to Beat is not available in the local metadata; distance-to-beat studies still need an oracle/BTC alignment layer.",
            "The raw 3.2 GB orderbook parquet is registered in source_manifest but not materialized."
        ]
    }


def write_markdown_audit(path: Path, audit: dict[str, Any]) -> None:
    summary = audit["summary"]
    lines = [
        "# BTC 5m Research DB Audit",
        "",
        f"Database: `{audit['database']}`",
        f"Source: `{audit['sourceDir'].encode('unicode_escape').decode('ascii')}`",
        "",
        "## Summary",
        "",
        f"- Markets total: {summary['markets_total']}",
        f"- Markets resolved: {summary['markets_resolved']}",
        f"- Orderbook rows: {summary['orderbook_rows']}",
        f"- Orderbook markets: {summary['orderbook_markets']}",
        f"- Odds rows: {summary['odds_rows']}",
        f"- Odds markets: {summary['odds_markets']}",
        f"- Price rows: {summary['price_rows']}",
        f"- Price markets: {summary['price_markets']}",
        "",
        "## Notes",
        "",
        *[f"- {note}" for note in audit["notes"]],
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def one(con: duckdb.DuckDBPyConnection, query: str) -> dict[str, Any]:
    cursor = con.execute(query)
    columns = [column[0] for column in cursor.description]
    row = cursor.fetchone()
    return dict(zip(columns, row or []))


def many(con: duckdb.DuckDBPyConnection, query: str) -> list[dict[str, Any]]:
    cursor = con.execute(query)
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def sql_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace("'", "''")


def utc_iso(seconds: int) -> str:
    return dt.datetime.fromtimestamp(seconds, tz=dt.timezone.utc).isoformat()


if __name__ == "__main__":
    main()
