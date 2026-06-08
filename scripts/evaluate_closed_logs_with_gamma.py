#!/usr/bin/env python3
"""
Avalia eventos paper fechados cruzando logs locais com resolucao Gamma.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import duckdb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs-db", default="data/research/polymarket_bot_logs.duckdb")
    parser.add_argument("--gamma-metadata", default="research-output/gamma-btc5-metadata/gamma_btc5_closed_metadata.json")
    parser.add_argument("--output-dir", default="research-output/gamma-btc5-metadata")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    gamma_by_slug = {
        row["slug"]: row
        for row in json.loads(Path(args.gamma_metadata).read_text(encoding="utf-8"))
    }
    rows = load_closed_events(Path(args.logs_db), gamma_by_slug)
    summary = summarize(rows)

    trades_csv = output_dir / "closed_paper_vs_gamma_trades.csv"
    setup_csv = output_dir / "closed_paper_vs_gamma_by_setup.csv"
    summary_json = output_dir / "closed_paper_vs_gamma_summary.json"
    summary_md = output_dir / "closed_paper_vs_gamma_summary.md"
    write_csv(trades_csv, rows)
    write_csv(setup_csv, flatten_setup_summary(summary))
    summary_json.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(summary_md, summary, rows, args)

    print(json.dumps({
        "ok": True,
        "trades": len(rows),
        "matchedGamma": summary["overall"]["matchedGamma"],
        "csv": str(trades_csv),
        "setupCsv": str(setup_csv),
        "summary": str(summary_md),
    }, indent=2, ensure_ascii=False))


def load_closed_events(logs_db: Path, gamma_by_slug: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    con = duckdb.connect(str(logs_db), read_only=True)
    cursor = con.execute("""
        SELECT source_file, line_no, family, event_type, event_ts, slug, side, pnl, price, size, payload_json
        FROM research.paper_closed_events
        WHERE slug LIKE 'btc-updown-5m-%'
        ORDER BY event_ts, source_file, line_no
    """)
    columns = [column[0] for column in cursor.description]
    rows: list[dict[str, Any]] = []
    for raw in [dict(zip(columns, row)) for row in cursor.fetchall()]:
        payload = json.loads(raw["payload_json"])
        ee = payload.get("ee") if isinstance(payload.get("ee"), dict) else {}
        gamma = gamma_by_slug.get(raw["slug"])
        entry_side = first_non_empty(raw.get("side"), ee.get("entry_side"), payload.get("side"))
        bot_outcome = first_non_empty(ee.get("outcome"), payload.get("outcome"))
        setup = first_non_empty(payload.get("setup"), payload.get("setup_name"), payload.get("strategy"), payload.get("strategy_name"), raw["family"])
        session_id = first_non_empty(payload.get("session_id"), payload.get("sessionId"))
        pnl = numeric(first_non_empty(raw.get("pnl"), ee.get("pnl"), payload.get("pnl")))
        entry_price = numeric(first_non_empty(raw.get("price"), ee.get("entry_ep"), payload.get("entry_price")))
        entry_secs = numeric(ee.get("entry_secs"))
        qty = numeric(first_non_empty(raw.get("size"), ee.get("qty"), payload.get("qty")))
        result = gamma.get("result") if gamma else None
        rows.append({
            "slug": raw["slug"],
            "family": raw["family"],
            "setup": setup,
            "session_id": session_id,
            "event_type": raw["event_type"],
            "event_ts": raw["event_ts"],
            "event_utc": utc_iso(raw["event_ts"]),
            "source_file": raw["source_file"],
            "line_no": raw["line_no"],
            "entry_side": entry_side,
            "bot_outcome": bot_outcome,
            "close_reason": first_non_empty(bot_outcome, raw["event_type"]),
            "gamma_result": result,
            "side_matches_gamma": entry_side == result if entry_side and result else None,
            "pnl": pnl,
            "entry_price": entry_price,
            "entry_price_bucket": price_bucket(entry_price),
            "qty": qty,
            "entry_secs": entry_secs,
            "entry_secs_bucket": secs_bucket(entry_secs),
            "hedge_ep": numeric(ee.get("hedge_ep")),
            "hedge_secs": numeric(ee.get("hedge_secs")),
            "price_to_beat": gamma.get("price_to_beat") if gamma else None,
            "final_price": gamma.get("final_price") if gamma else None,
            "market_id": gamma.get("market_id") if gamma else None,
            "condition_id": gamma.get("condition_id") if gamma else None,
        })
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = {
        "overall": rows,
    }
    for key in ["setup", "close_reason", "event_type", "entry_side", "entry_price_bucket", "entry_secs_bucket"]:
        by_value: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            by_value[str(row.get(key) or "UNKNOWN")].append(row)
        for value, value_rows in by_value.items():
            groups[f"{key}:{value}"] = value_rows
    for keys in [
        ("setup", "close_reason"),
        ("setup", "entry_side"),
        ("setup", "entry_price_bucket"),
        ("setup", "entry_secs_bucket"),
    ]:
        by_values: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            label = "|".join(str(row.get(key) or "UNKNOWN") for key in keys)
            by_values[label].append(row)
        for value, value_rows in by_values.items():
            groups[f"{'+'.join(keys)}:{value}"] = value_rows

    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "overall": summarize_rows(rows),
        "groups": {
            name: summarize_rows(value_rows)
            for name, value_rows in groups.items()
            if name != "overall"
        },
    }


def flatten_setup_summary(summary: dict[str, Any]) -> list[dict[str, Any]]:
    selected_prefixes = (
        "setup:",
        "setup+close_reason:",
        "setup+entry_side:",
        "setup+entry_price_bucket:",
        "setup+entry_secs_bucket:",
    )
    rows: list[dict[str, Any]] = []
    for group, values in summary["groups"].items():
        if not group.startswith(selected_prefixes):
            continue
        dimension, value = group.split(":", 1)
        rows.append({"dimension": dimension, "value": value, **values})
    rows.sort(key=lambda row: (row["dimension"], -int(row["events"]), str(row["value"])))
    return rows


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    pnls = [row["pnl"] for row in rows if row.get("pnl") is not None]
    matched = [row for row in rows if row.get("gamma_result")]
    side_compared = [row for row in matched if row.get("entry_side")]
    side_wins = [row for row in side_compared if row.get("side_matches_gamma")]
    bot_wins = [row for row in rows if str(row.get("bot_outcome") or "").upper() == "WIN"]
    positive_pnl = [row for row in rows if row.get("pnl") is not None and row["pnl"] > 0]
    return {
        "events": len(rows),
        "matchedGamma": len(matched),
        "withPnl": len(pnls),
        "totalPnl": round(sum(pnls), 10) if pnls else None,
        "avgPnl": round(sum(pnls) / len(pnls), 10) if pnls else None,
        "positivePnlRows": len(positive_pnl),
        "positivePnlRate": len(positive_pnl) / len(pnls) if pnls else None,
        "botWins": len(bot_wins),
        "botWinRate": len(bot_wins) / len(rows) if rows else None,
        "sideCompared": len(side_compared),
        "sideWinsVsGamma": len(side_wins),
        "sideWinRateVsGamma": len(side_wins) / len(side_compared) if side_compared else None,
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(path: Path, summary: dict[str, Any], rows: list[dict[str, Any]], args: argparse.Namespace) -> None:
    overall = summary["overall"]
    lines = [
        "# Closed Paper vs Gamma Resolution",
        "",
        f"Generated: `{summary['generatedAt']}`",
        f"Logs DB: `{args.logs_db}`",
        f"Gamma metadata: `{args.gamma_metadata}`",
        "",
        "## Overall",
        "",
        f"- Closed BTC5 events: {overall['events']}",
        f"- Matched Gamma metadata: {overall['matchedGamma']}",
        f"- Rows with PnL: {overall['withPnl']}",
        f"- Total PnL: {overall['totalPnl']}",
        f"- Avg PnL: {overall['avgPnl']}",
        f"- Positive PnL rate: {format_pct(overall['positivePnlRate'])}",
        f"- Explicit WIN outcome rate: {format_pct(overall['botWinRate'])}",
        f"- Side win rate vs Gamma: {format_pct(overall['sideWinRateVsGamma'])}",
        "",
        "## Setup Summary",
        "",
    ]
    for name, row in summary["groups"].items():
        if not name.startswith(("setup:", "setup+close_reason:", "setup+entry_side:", "setup+entry_price_bucket:", "setup+entry_secs_bucket:")):
            continue
        lines.append(
            f"- {name}: {row['events']} events, totalPnL={row['totalPnl']}, "
            f"positivePnlRate={format_pct(row['positivePnlRate'])}, sideWinRateVsGamma={format_pct(row['sideWinRateVsGamma'])}"
        )
    lines.extend(["", "## Other Groups", ""])
    for name, row in summary["groups"].items():
        if name.startswith(("setup:", "setup+close_reason:", "setup+entry_side:", "setup+entry_price_bucket:", "setup+entry_secs_bucket:")):
            continue
        lines.append(
            f"- {name}: {row['events']} events, totalPnL={row['totalPnl']}, "
            f"positivePnlRate={format_pct(row['positivePnlRate'])}, sideWinRateVsGamma={format_pct(row['sideWinRateVsGamma'])}"
        )
    lines.extend(["", "## Notes", ""])
    lines.append("- Gamma result is inferred from priceToBeat/finalPrice when available.")
    lines.append("- This validates closed paper log direction against resolved market metadata; it still does not provide historical book quality for new backtests.")
    path.write_text("\n".join(lines), encoding="utf-8")


def first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def numeric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def secs_bucket(value: float | None) -> str | None:
    if value is None:
        return None
    if value < 60:
        return "000-059"
    if value < 90:
        return "060-089"
    if value < 120:
        return "090-119"
    if value < 150:
        return "120-149"
    if value < 180:
        return "150-179"
    return "180+"


def price_bucket(value: float | None) -> str | None:
    if value is None:
        return None
    if value < 0.80:
        return "<0.80"
    if value < 0.83:
        return "0.80-0.82"
    if value < 0.85:
        return "0.83-0.84"
    if value < 0.87:
        return "0.85-0.86"
    return "0.87+"


def utc_iso(value: Any) -> str | None:
    parsed = numeric(value)
    if parsed is None:
        return None
    return dt.datetime.fromtimestamp(parsed, tz=dt.timezone.utc).isoformat()


def format_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value * 100:.2f}%"


if __name__ == "__main__":
    main()
