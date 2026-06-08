#!/usr/bin/env python3
"""
Baixa metadata/resolucao da Gamma API para slugs BTC Up/Down 5m presentes nos logs.

Uso principal:
- identificar slugs dos logs que nao existem na base BTC5 local
- priorizar slugs com eventos paper fechados
- extrair market_id, condition_id, token ids, priceToBeat, finalPrice e resultado
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import duckdb

GAMMA_BASE = "https://gamma-api.polymarket.com"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs-db", default="data/research/polymarket_bot_logs.duckdb")
    parser.add_argument("--btc5-db", default="data/research/btc5_research.duckdb")
    parser.add_argument("--output-dir", default="research-output/gamma-btc5-metadata")
    parser.add_argument("--closed-only", action="store_true", help="Busca apenas slugs com eventos fechados nos logs.")
    parser.add_argument("--limit", type=int, default=0, help="Limita quantidade de slugs. 0 = sem limite.")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--sleep-ms", type=int, default=0, help="Pausa simples antes de cada request.")
    args = parser.parse_args()

    logs_db = Path(args.logs_db)
    btc5_db = Path(args.btc5_db)
    output_dir = Path(args.output_dir)
    cache_dir = output_dir / "cache"
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    slugs = select_slugs(logs_db, btc5_db if btc5_db.exists() else None, args.closed_only)
    if args.limit > 0:
        slugs = slugs[: args.limit]

    rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(fetch_slug, slug["slug"], cache_dir, args.sleep_ms): slug
            for slug in slugs
        }
        for future in as_completed(futures):
            slug_info = futures[future]
            try:
                rows.append({**slug_info, **future.result()})
            except Exception as exc:  # noqa: BLE001
                errors.append({**slug_info, "error": str(exc)})

    rows.sort(key=lambda row: row["slug"])
    errors.sort(key=lambda row: row["slug"])
    prefix = "closed" if args.closed_only else "all"
    json_path = output_dir / f"gamma_btc5_{prefix}_metadata.json"
    csv_path = output_dir / f"gamma_btc5_{prefix}_metadata.csv"
    error_path = output_dir / f"gamma_btc5_{prefix}_errors.json"
    summary_path = output_dir / f"gamma_btc5_{prefix}_summary.md"

    json_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    error_path.write_text(json.dumps(errors, indent=2, ensure_ascii=False), encoding="utf-8")
    write_csv(csv_path, rows)
    write_summary(summary_path, rows, errors, args, logs_db, btc5_db)

    print(json.dumps({
        "ok": True,
        "requested": len(slugs),
        "fetched": len(rows),
        "errors": len(errors),
        "json": str(json_path),
        "csv": str(csv_path),
        "summary": str(summary_path),
    }, indent=2, ensure_ascii=False))


def select_slugs(logs_db: Path, btc5_db: Path | None, closed_only: bool) -> list[dict[str, Any]]:
    con = duckdb.connect(str(logs_db), read_only=True)
    if btc5_db:
        con.execute(f"ATTACH '{sql_path(btc5_db)}' AS btc5 (READ_ONLY)")
        join_filter = """
            AND NOT EXISTS (
                SELECT 1
                FROM btc5.research.btc5_markets m
                WHERE m.slug IS NOT NULL AND m.slug != '' AND m.slug = e.slug
            )
        """
    else:
        join_filter = ""
    closed_filter = "AND e.is_closed" if closed_only else ""
    query = f"""
        SELECT
            e.slug,
            CAST(regexp_extract(e.slug, '([0-9]{{10}})$', 1) AS BIGINT) AS window_start_ts,
            COUNT(*) AS log_events,
            COUNT(*) FILTER (WHERE e.is_closed) AS closed_events,
            COUNT(DISTINCT e.family) AS families,
            MIN(e.family) AS example_family
        FROM research.raw_events e
        WHERE regexp_matches(e.slug, '^btc-updown-5m-[0-9]{{10}}$')
          {closed_filter}
          {join_filter}
        GROUP BY e.slug
        ORDER BY closed_events DESC, log_events DESC, e.slug
    """
    cursor = con.execute(query)
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def fetch_slug(slug: str, cache_dir: Path, sleep_ms: int) -> dict[str, Any]:
    cache_path = cache_dir / f"{slug}.json"
    if cache_path.exists():
        events = json.loads(cache_path.read_text(encoding="utf-8"))
        from_cache = True
    else:
        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000)
        url = f"{GAMMA_BASE}/events?slug={urllib.parse.quote(slug)}"
        request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            events = json.loads(response.read().decode("utf-8"))
        cache_path.write_text(json.dumps(events, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        from_cache = False

    event = events[0] if events else {}
    markets = event.get("markets") or []
    market = markets[0] if markets else {}
    metadata = event.get("eventMetadata") or {}
    outcomes = parse_json_array(market.get("outcomes"))
    outcome_prices = parse_float_array(market.get("outcomePrices"))
    token_ids = parse_json_array(market.get("clobTokenIds") or market.get("tokenIds"))
    result = infer_result(outcomes, outcome_prices, metadata)

    return {
        "gamma_found": bool(events),
        "from_cache": from_cache,
        "event_id": stringify(event.get("id")),
        "market_id": stringify(market.get("id")),
        "condition_id": stringify(market.get("conditionId")),
        "question_id": stringify(market.get("questionID")),
        "title": stringify(event.get("title") or market.get("question")),
        "event_slug": stringify(event.get("slug")),
        "market_slug": stringify(market.get("slug")),
        "active": boolish(market.get("active", event.get("active"))),
        "closed": boolish(market.get("closed", event.get("closed"))),
        "accepting_orders": boolish(market.get("acceptingOrders")),
        "uma_resolution_status": stringify(market.get("umaResolutionStatus")),
        "resolution_source": stringify(market.get("resolutionSource") or event.get("resolutionSource")),
        "start_date": stringify(event.get("startDate") or market.get("startDate")),
        "end_date": stringify(event.get("endDate") or market.get("endDate")),
        "closed_time": stringify(event.get("closedTime") or market.get("closedTime")),
        "outcomes": json.dumps(outcomes, separators=(",", ":")),
        "outcome_prices": json.dumps(outcome_prices, separators=(",", ":")),
        "up_token_id": token_ids[0] if len(token_ids) > 0 else None,
        "down_token_id": token_ids[1] if len(token_ids) > 1 else None,
        "price_to_beat": numeric(metadata.get("priceToBeat")),
        "final_price": numeric(metadata.get("finalPrice")),
        "result": result,
        "volume": numeric(market.get("volume") or event.get("volume")),
        "volume_clob": numeric(market.get("volumeClob")),
        "best_bid": numeric(market.get("bestBid")),
        "best_ask": numeric(market.get("bestAsk")),
        "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def infer_result(outcomes: list[str], prices: list[float], metadata: dict[str, Any]) -> str | None:
    final_price = numeric(metadata.get("finalPrice"))
    price_to_beat = numeric(metadata.get("priceToBeat"))
    if final_price is not None and price_to_beat is not None:
        return "UP" if final_price >= price_to_beat else "DOWN"
    if len(outcomes) == len(prices) and prices:
        winner_index = max(range(len(prices)), key=lambda index: prices[index])
        if prices[winner_index] >= 0.99:
            outcome = outcomes[winner_index].strip().upper()
            if outcome in {"UP", "DOWN"}:
                return outcome
    return None


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_summary(path: Path, rows: list[dict[str, Any]], errors: list[dict[str, Any]], args: argparse.Namespace, logs_db: Path, btc5_db: Path) -> None:
    found = [row for row in rows if row.get("gamma_found")]
    resolved = [row for row in found if row.get("result") in {"UP", "DOWN"}]
    with_price_to_beat = [row for row in found if row.get("price_to_beat") is not None]
    lines = [
        "# Gamma BTC5 Metadata Fetch",
        "",
        f"Generated: `{dt.datetime.now(dt.timezone.utc).isoformat()}`",
        f"Logs DB: `{logs_db}`",
        f"BTC5 DB: `{btc5_db}`",
        f"Closed only: `{args.closed_only}`",
        "",
        "## Summary",
        "",
        f"- Requested slugs: {len(rows) + len(errors)}",
        f"- Fetched rows: {len(rows)}",
        f"- Errors: {len(errors)}",
        f"- Gamma found: {len(found)}",
        f"- Resolved result inferred: {len(resolved)}",
        f"- With priceToBeat: {len(with_price_to_beat)}",
    ]
    if rows:
        starts = [int(row["window_start_ts"]) for row in rows if row.get("window_start_ts") is not None]
        if starts:
            lines.extend([
                f"- Window start min: {utc_iso(min(starts))}",
                f"- Window start max: {utc_iso(max(starts))}",
            ])
    lines.extend(["", "## Notes", ""])
    lines.append("- Results are inferred from Gamma eventMetadata finalPrice/priceToBeat when available, otherwise final outcome prices.")
    lines.append("- This fetch adds metadata/resolution only; it does not add historical Polymarket book/odds snapshots.")
    path.write_text("\n".join(lines), encoding="utf-8")


def parse_json_array(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
        except json.JSONDecodeError:
            return [item.strip() for item in value.split(",") if item.strip()]
    return []


def parse_float_array(value: Any) -> list[float]:
    return [float(item) for item in parse_json_array(value) if numeric(item) is not None]


def numeric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed


def stringify(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def boolish(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"true", "1", "yes"}
    return bool(value)


def sql_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace("'", "''")


def utc_iso(value: int) -> str:
    return dt.datetime.fromtimestamp(value, tz=dt.timezone.utc).isoformat()


if __name__ == "__main__":
    main()
