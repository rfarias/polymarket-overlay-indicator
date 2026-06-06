#!/usr/bin/env python3
"""
Importa a base BTC 5m Parquet do projeto polymarket-bot para o formato canonico
usado pelos estudos TypeScript deste projeto.

O importador usa DuckDB para evitar carregar o orderbook bruto em memoria.
Por padrao, usa _btc5_ob_filtered.parquet, que ja contem 616 mercados resolvidos
com resample de 1s.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import duckdb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, help="Diretorio com _btc5_*.parquet")
    parser.add_argument("--output", required=True, help="Arquivo dataset.json de saida")
    parser.add_argument("--merge-input", help="Dataset JSON existente para anexar")
    parser.add_argument("--use-prices", action="store_true", help="Usa _btc5_prices.parquet em vez do orderbook filtrado")
    parser.add_argument("--include-unresolved", action="store_true", help="Inclui mercados sem resolution apenas quando o slug BTC 5m permite recuperar a janela")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    con.execute("SET memory_limit='2GB'")
    con.execute("SET threads=2")

    markets = load_markets(con, source_dir, args.include_unresolved)
    odds = load_prices(con, source_dir, args.include_unresolved) if args.use_prices else load_orderbook(con, source_dir, args.include_unresolved)
    base = load_json(Path(args.merge_input)) if args.merge_input else {"markets": [], "btcPrices": [], "odds": []}

    existing_market_ids = {str(row["marketId"]) for row in base.get("markets", [])}
    existing_odd_keys = {
        (str(row["marketId"]), int(row["timeMs"]))
        for row in base.get("odds", [])
        if "marketId" in row and "timeMs" in row
    }

    merged_markets = list(base.get("markets", []))
    merged_markets.extend(row for row in markets if row["marketId"] not in existing_market_ids)

    merged_odds = list(base.get("odds", []))
    merged_odds.extend(row for row in odds if (row["marketId"], row["timeMs"]) not in existing_odd_keys)

    dataset = {
        "markets": merged_markets,
        "btcPrices": list(base.get("btcPrices", [])),
        "odds": merged_odds,
        "sourceNotes": [
            "Imported from polymarket-bot BTC 5m parquet base.",
            "Market window is derived from btc-updown-5m-{unix_start} slug when available.",
            "Orderbook import uses best_bid per outcome resampled at 1s.",
            "Ask prices are inferred from complementary bids: upAsk=1-downBid and downAsk=1-upBid.",
            "priceToBeat is unavailable in this parquet metadata and is set to 0; use this dataset for odds calibration, not distance-to-beat studies."
        ]
    }

    output.write_text(json.dumps(dataset, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "output": str(output),
        "markets": len(dataset["markets"]),
        "btcPrices": len(dataset["btcPrices"]),
        "odds": len(dataset["odds"]),
        "importedMarkets": len(markets),
        "importedOdds": len(odds)
    }, indent=2))


def load_markets(con: duckdb.DuckDBPyConnection, source_dir: Path, include_unresolved: bool) -> list[dict[str, Any]]:
    markets_path = sql_path(source_dir / "_btc5_markets.parquet")
    resolution_filter = "CAST(m.resolution AS INTEGER) IN (0, 1)" if not include_unresolved else "regexp_matches(m.slug, '^btc-updown-5m-[0-9]{10}$')"
    query = f"""
        WITH normalized AS (
            SELECT
                m.*,
                CASE
                    WHEN regexp_matches(m.slug, '^btc-updown-5m-[0-9]{{10}}$')
                    THEN CAST(regexp_extract(m.slug, '([0-9]{{10}})$', 1) AS BIGINT)
                    ELSE CAST(m.start_ts AS BIGINT)
                END AS window_start_ts
            FROM read_parquet('{markets_path}') m
        )
        SELECT
            CAST(m.market_id AS VARCHAR) AS marketId,
            COALESCE(NULLIF(m.slug, ''), CAST(m.market_id AS VARCHAR)) AS slug,
            CAST(COALESCE(m.window_start_ts, 0) * 1000 AS BIGINT) AS startTimeMs,
            CAST((COALESCE(m.window_start_ts, 0) + 300) * 1000 AS BIGINT) AS endTimeMs,
            0::DOUBLE AS priceToBeat,
            CASE
                WHEN CAST(m.resolution AS INTEGER) = 1 THEN 'UP'
                WHEN CAST(m.resolution AS INTEGER) = 0 THEN 'DOWN'
                ELSE NULL
            END AS result,
            CAST(m.up_token_id AS VARCHAR) AS upTokenId,
            CAST(m.down_token_id AS VARCHAR) AS downTokenId
        FROM normalized m
        WHERE {resolution_filter}
        ORDER BY m.window_start_ts, m.market_id
    """
    return query_dicts(con, query)


def load_orderbook(con: duckdb.DuckDBPyConnection, source_dir: Path, include_unresolved: bool) -> list[dict[str, Any]]:
    orderbook_path = sql_path(source_dir / "_btc5_ob_filtered.parquet")
    markets_path = sql_path(source_dir / "_btc5_markets.parquet")
    resolution_filter = "CAST(resolution AS INTEGER) IN (0, 1)" if not include_unresolved else "regexp_matches(slug, '^btc-updown-5m-[0-9]{10}$')"
    query = f"""
        WITH resolved AS (
            SELECT CAST(market_id AS VARCHAR) AS market_id
            FROM read_parquet('{markets_path}')
            WHERE {resolution_filter}
        ),
        pivoted AS (
            SELECT
                CAST(ob.market_id AS VARCHAR) AS marketId,
                CAST(ob.ts_sec * 1000 AS BIGINT) AS timeMs,
                MAX(CASE WHEN lower(ob.outcome) = 'up' THEN ob.best_bid END) AS upBid,
                MAX(CASE WHEN lower(ob.outcome) = 'down' THEN ob.best_bid END) AS downBid
            FROM read_parquet('{orderbook_path}') ob
            JOIN resolved r ON CAST(ob.market_id AS VARCHAR) = r.market_id
            GROUP BY ob.market_id, ob.ts_sec
        )
        SELECT
            marketId,
            timeMs,
            upBid,
            CASE WHEN downBid IS NULL THEN NULL ELSE greatest(0.01, least(0.99, 1 - downBid)) END AS upAsk,
            downBid,
            CASE WHEN upBid IS NULL THEN NULL ELSE greatest(0.01, least(0.99, 1 - upBid)) END AS downAsk,
            'book' AS source
        FROM pivoted
        WHERE upBid IS NOT NULL OR downBid IS NOT NULL
        ORDER BY marketId, timeMs
    """
    return query_dicts(con, query)


def load_prices(con: duckdb.DuckDBPyConnection, source_dir: Path, include_unresolved: bool) -> list[dict[str, Any]]:
    prices_path = sql_path(source_dir / "_btc5_prices.parquet")
    markets_path = sql_path(source_dir / "_btc5_markets.parquet")
    resolution_filter = "CAST(resolution AS INTEGER) IN (0, 1)" if not include_unresolved else "regexp_matches(slug, '^btc-updown-5m-[0-9]{10}$')"
    query = f"""
        WITH resolved AS (
            SELECT CAST(market_id AS VARCHAR) AS market_id
            FROM read_parquet('{markets_path}')
            WHERE {resolution_filter}
        )
        SELECT
            CAST(p.market_id AS VARCHAR) AS marketId,
            CAST(p.timestamp * 1000 AS BIGINT) AS timeMs,
            NULL::DOUBLE AS upBid,
            CAST(p.up_price AS DOUBLE) AS upAsk,
            NULL::DOUBLE AS downBid,
            CAST(p.down_price AS DOUBLE) AS downAsk,
            'prices-history' AS source
        FROM read_parquet('{prices_path}') p
        JOIN resolved r ON CAST(p.market_id AS VARCHAR) = r.market_id
        WHERE p.up_price > 0 AND p.up_price < 1 AND p.down_price > 0 AND p.down_price < 1
        ORDER BY p.market_id, p.timestamp
    """
    return query_dicts(con, query)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def query_dicts(con: duckdb.DuckDBPyConnection, query: str) -> list[dict[str, Any]]:
    cursor = con.execute(query)
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def sql_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace("'", "''")


if __name__ == "__main__":
    main()
