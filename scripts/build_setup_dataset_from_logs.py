#!/usr/bin/env python3
"""
Converte snapshots dos logs em dataset canonico para `npm run setup-backtest`.

Usa:
- snapshots em research.raw_events
- metadata/resolucao Gamma por slug

O dataset resultante permite simular o catalogo de setups sobre os snapshots
observados nos logs, em vez de avaliar apenas trades paper que realmente abriram.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import duckdb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs-db", default="data/research/polymarket_bot_logs.duckdb")
    parser.add_argument("--gamma-metadata", default="research-output/gamma-btc5-metadata/gamma_btc5_all_metadata.json")
    parser.add_argument("--output", default="data/external-btc5/log-snapshots-gamma.dataset.json")
    args = parser.parse_args()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    gamma_rows = json.loads(Path(args.gamma_metadata).read_text(encoding="utf-8"))
    gamma_by_slug = {row["slug"]: row for row in gamma_rows if row.get("result") in {"UP", "DOWN"} and row.get("price_to_beat")}

    markets = build_markets(gamma_by_slug)
    btc_prices, odds = build_series(Path(args.logs_db), gamma_by_slug)
    dataset = {
        "markets": markets,
        "btcPrices": btc_prices,
        "odds": odds,
        "sourceNotes": [
            "Built from local polymarket-bot log snapshots.",
            "Market result, token ids, priceToBeat and finalPrice are enriched from Gamma API.",
            "BTC price uses log reference.reference_price when present.",
            "Odds use current_scalp and next1_arb top-of-book fields from snapshot payloads.",
            "This is replay over observed log snapshots, not full historical book reconstruction."
        ],
    }
    output.write_text(json.dumps(dataset, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "output": str(output),
        "markets": len(markets),
        "btcPrices": len(btc_prices),
        "odds": len(odds),
    }, indent=2, ensure_ascii=False))


def build_markets(gamma_by_slug: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    markets: list[dict[str, Any]] = []
    for slug, row in sorted(gamma_by_slug.items()):
        start_ts = int(row.get("window_start_ts") or slug.rsplit("-", 1)[-1])
        markets.append({
            "marketId": str(row.get("market_id") or slug),
            "slug": slug,
            "startTimeMs": start_ts * 1000,
            "endTimeMs": (start_ts + 300) * 1000,
            "priceToBeat": float(row["price_to_beat"]),
            "result": row["result"],
            "upTokenId": row.get("up_token_id"),
            "downTokenId": row.get("down_token_id"),
        })
    return markets


def build_series(logs_db: Path, gamma_by_slug: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    con = duckdb.connect(str(logs_db), read_only=True)
    rows = con.execute("""
        SELECT payload_json
        FROM research.raw_events
        WHERE event_type = 'snapshot'
    """).fetchall()
    btc_by_time: dict[int, dict[str, Any]] = {}
    odds_by_key: dict[tuple[str, int], dict[str, Any]] = {}
    for (payload_json,) in rows:
        payload = json.loads(payload_json)
        ts = numeric(payload.get("ts"))
        if ts is None:
            continue
        time_ms = int(ts * 1000)
        reference = payload.get("reference") if isinstance(payload.get("reference"), dict) else {}
        reference_price = numeric(reference.get("reference_price"))
        if reference_price and reference_price > 0:
            btc_by_time[time_ms] = {
                "timeMs": time_ms,
                "price": reference_price,
                "source": "other",
            }
        add_current_odds(payload, gamma_by_slug, time_ms, odds_by_key)
        add_next1_odds(payload, gamma_by_slug, time_ms, odds_by_key)

    return (
        [btc_by_time[key] for key in sorted(btc_by_time)],
        [odds_by_key[key] for key in sorted(odds_by_key, key=lambda item: (item[0], item[1]))],
    )


def add_current_odds(
    payload: dict[str, Any],
    gamma_by_slug: dict[str, dict[str, Any]],
    time_ms: int,
    odds_by_key: dict[tuple[str, int], dict[str, Any]],
) -> None:
    slug = payload.get("current_slug")
    if not isinstance(slug, str) or slug not in gamma_by_slug:
        return
    scalp = payload.get("current_scalp") if isinstance(payload.get("current_scalp"), dict) else {}
    exec_quote = payload.get("current_exec") if isinstance(payload.get("current_exec"), dict) else {}
    up_bid = first_number(scalp.get("up_bid"), exec_quote.get("up_bid"))
    down_bid = first_number(scalp.get("down_bid"), exec_quote.get("down_bid"))
    up_ask = first_number(scalp.get("up_ask"), complement(down_bid))
    down_ask = first_number(scalp.get("down_ask"), complement(up_bid))
    row = odds_row(
        gamma_by_slug[slug],
        time_ms,
        up_bid=up_bid,
        up_ask=up_ask,
        down_bid=down_bid,
        down_ask=down_ask,
        source="book",
    )
    if row:
        odds_by_key[(row["marketId"], time_ms)] = row


def add_next1_odds(
    payload: dict[str, Any],
    gamma_by_slug: dict[str, dict[str, Any]],
    time_ms: int,
    odds_by_key: dict[tuple[str, int], dict[str, Any]],
) -> None:
    slug = payload.get("next1_slug")
    if not isinstance(slug, str) or slug not in gamma_by_slug:
        return
    arb = payload.get("next1_arb") if isinstance(payload.get("next1_arb"), dict) else {}
    metrics = arb.get("metrics") if isinstance(arb.get("metrics"), dict) else {}
    row = odds_row(
        gamma_by_slug[slug],
        time_ms,
        up_bid=numeric(metrics.get("up_bid")),
        up_ask=numeric(metrics.get("up_ask")),
        down_bid=numeric(metrics.get("down_bid")),
        down_ask=numeric(metrics.get("down_ask")),
        source="book",
    )
    if row:
        odds_by_key[(row["marketId"], time_ms)] = row


def odds_row(
    gamma: dict[str, Any],
    time_ms: int,
    up_bid: float | None,
    up_ask: float | None,
    down_bid: float | None,
    down_ask: float | None,
    source: str,
) -> dict[str, Any] | None:
    if not any(valid_price(value) for value in [up_bid, up_ask, down_bid, down_ask]):
        return None
    return {
        "marketId": str(gamma.get("market_id") or gamma["slug"]),
        "timeMs": time_ms,
        "upBid": up_bid if valid_price(up_bid) else None,
        "upAsk": up_ask if valid_price(up_ask) else None,
        "downBid": down_bid if valid_price(down_bid) else None,
        "downAsk": down_ask if valid_price(down_ask) else None,
        "source": source,
    }


def numeric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed


def first_number(*values: Any) -> float | None:
    for value in values:
        parsed = numeric(value)
        if parsed is not None:
            return parsed
    return None


def complement(value: float | None) -> float | None:
    if value is None:
        return None
    return max(0.01, min(0.99, 1 - value))


def valid_price(value: float | None) -> bool:
    return value is not None and value > 0 and value < 1


if __name__ == "__main__":
    main()
