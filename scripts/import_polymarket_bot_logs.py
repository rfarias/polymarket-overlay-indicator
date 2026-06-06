#!/usr/bin/env python3
"""
Importa logs paper do repositorio polymarket-bot para uma base DuckDB.

Foco:
- logs/ee_paper_*/ee_paper.jsonl
- logs/el_flip_paper_*/el_flip_paper.jsonl
- logs/multi_coin_observer_*/*.jsonl e logs/multi_coin_observer_*

O script preserva o payload JSON bruto e extrai campos comuns para auditoria.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
from pathlib import Path
from typing import Any, Iterable

import duckdb
import pandas as pd

CLOSED_TYPES = {
    "trade_closed",
    "flat",
    "redeem_flat",
    "ee_paper_closed",
    "ee_paper_stop_loss",
    "ee_paper_profit_protect",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, help="Raiz do repo polymarket-bot")
    parser.add_argument("--output-db", default="data/research/polymarket_bot_logs.duckdb")
    parser.add_argument("--audit-output", default="research-output/log-audit/polymarket_bot_logs_audit.json")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    output_db = Path(args.output_db)
    audit_output = Path(args.audit_output)
    output_db.parent.mkdir(parents=True, exist_ok=True)
    audit_output.parent.mkdir(parents=True, exist_ok=True)

    specs = [
        ("ee_paper", "logs/ee_paper_*/ee_paper.jsonl"),
        ("el_flip_paper", "logs/el_flip_paper_*/el_flip_paper.jsonl"),
        ("multi_coin_observer", "logs/multi_coin_observer_*/*.jsonl"),
        ("multi_coin_observer", "logs/multi_coin_observer_*"),
    ]

    rows: list[dict[str, Any]] = []
    files_seen: set[Path] = set()
    for family, pattern in specs:
        for path_text in sorted(glob.glob(str(source_dir / pattern))):
            path = Path(path_text)
            if path in files_seen or not path.is_file():
                continue
            files_seen.add(path)
            rows.extend(read_jsonl(path, source_dir, family))

    con = duckdb.connect(str(output_db))
    create_tables(con)
    insert_rows(con, rows)
    audit = collect_audit(con, output_db, source_dir, rows)
    audit_output.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown_audit(audit_output.with_suffix(".md"), audit)

    print(json.dumps({
        "ok": True,
        "db": str(output_db),
        "audit": str(audit_output),
        "files": audit["summary"]["files"],
        "events": audit["summary"]["events"],
        "closedEvents": audit["summary"]["closedEvents"],
    }, indent=2, ensure_ascii=False))


def read_jsonl(path: Path, source_dir: Path, family: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    relative = path.relative_to(source_dir)
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line_no, line in enumerate(f, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as exc:
                payload = {"type": "json_parse_error", "error": str(exc), "raw": text[:500]}
            rows.append(normalize_event(family, relative, line_no, payload))
    return rows


def normalize_event(family: str, relative: Path, line_no: int, payload: dict[str, Any]) -> dict[str, Any]:
    event_type = str(first(payload, ["type", "event", "kind"]) or "")
    ts_value = first(payload, ["ts", "timestamp", "time", "observed_at", "observedAt", "created_at", "createdAt"])
    slug = first(payload, ["slug", "market_slug", "marketSlug", "current_slug", "currentSlug"])
    market_id = first(payload, ["market_id", "marketId", "condition_id", "conditionId"])
    side = first(payload, ["side", "outcome", "direction"]) or nested(payload, ["ee", "entry_side"])
    pnl = numeric(first(payload, ["pnl", "net_pnl", "netPnl", "realized_pnl", "realizedPnl"]) or nested(payload, ["ee", "pnl"]))
    price = numeric(first(payload, ["price", "entry_price", "entryPrice", "avg_price", "avgPrice"]) or nested(payload, ["ee", "entry_ep"]))
    size = numeric(first(payload, ["size", "qty", "quantity", "shares"]) or nested(payload, ["ee", "qty"]))
    return {
        "family": family,
        "source_file": str(relative),
        "line_no": line_no,
        "event_type": event_type,
        "event_ts": stringify(ts_value),
        "market_id": stringify(market_id),
        "slug": stringify(slug),
        "side": stringify(side),
        "pnl": pnl,
        "price": price,
        "size": size,
        "is_closed": event_type in CLOSED_TYPES,
        "payload_json": json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
    }


def create_tables(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA IF NOT EXISTS research")
    con.execute("""
        CREATE OR REPLACE TABLE research.paper_events (
            family VARCHAR,
            source_file VARCHAR,
            line_no INTEGER,
            event_type VARCHAR,
            event_ts VARCHAR,
            market_id VARCHAR,
            slug VARCHAR,
            side VARCHAR,
            pnl DOUBLE,
            price DOUBLE,
            size DOUBLE,
            is_closed BOOLEAN,
            payload_json VARCHAR
        )
    """)


def insert_rows(con: duckdb.DuckDBPyConnection, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    df = pd.DataFrame(rows)
    con.register("paper_events_import", df)
    con.execute("INSERT INTO research.paper_events SELECT * FROM paper_events_import")
    con.unregister("paper_events_import")
    con.execute("""
        CREATE OR REPLACE TABLE research.paper_closed_events AS
        SELECT *
        FROM research.paper_events
        WHERE is_closed
    """)


def collect_audit(
    con: duckdb.DuckDBPyConnection,
    output_db: Path,
    source_dir: Path,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    summary = one(con, """
        SELECT
            COUNT(DISTINCT source_file) AS files,
            COUNT(*) AS events,
            SUM(CASE WHEN is_closed THEN 1 ELSE 0 END) AS closedEvents,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS slugs,
            COUNT(DISTINCT market_id) FILTER (WHERE market_id IS NOT NULL AND market_id != '') AS marketIds
        FROM research.paper_events
    """)
    by_family = many(con, """
        SELECT family, COUNT(DISTINCT source_file) AS files, COUNT(*) AS events,
               SUM(CASE WHEN is_closed THEN 1 ELSE 0 END) AS closedEvents
        FROM research.paper_events
        GROUP BY family
        ORDER BY family
    """)
    by_type = many(con, """
        SELECT family, event_type, COUNT(*) AS events
        FROM research.paper_events
        GROUP BY family, event_type
        ORDER BY family, events DESC
        LIMIT 80
    """)
    closed_pnl = many(con, """
        SELECT family, COUNT(*) AS closedEvents, COUNT(pnl) AS pnlRows,
               SUM(pnl) AS totalPnl, AVG(pnl) AS avgPnl
        FROM research.paper_closed_events
        GROUP BY family
        ORDER BY family
    """)
    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "database": str(output_db),
        "sourceDir": str(source_dir),
        "summary": summary,
        "byFamily": by_family,
        "topEventTypes": by_type,
        "closedPnl": closed_pnl,
        "closedTypes": sorted(CLOSED_TYPES),
        "notes": [
            "Closed events are event_type values listed in closedTypes.",
            "payload_json preserves the original JSON event for deeper parsing later.",
            "This importer focuses only on polymarket-bot paper/observer logs requested by the user."
        ],
    }


def write_markdown_audit(path: Path, audit: dict[str, Any]) -> None:
    summary = audit["summary"]
    lines = [
        "# Polymarket Bot Logs Audit",
        "",
        f"Database: `{audit['database']}`",
        f"Source: `{audit['sourceDir'].encode('unicode_escape').decode('ascii')}`",
        "",
        "## Summary",
        "",
        f"- Files: {summary.get('files', 0)}",
        f"- Events: {summary.get('events', 0)}",
        f"- Closed events: {summary.get('closedEvents', 0)}",
        f"- Slugs: {summary.get('slugs', 0)}",
        f"- Market IDs: {summary.get('marketIds', 0)}",
        "",
        "## By Family",
        "",
    ]
    for row in audit["byFamily"]:
        lines.append(f"- {row['family']}: {row['files']} files, {row['events']} events, {row['closedEvents']} closed")
    lines.extend(["", "## Notes", ""])
    lines.append(f"- Closed event types: {', '.join(audit['closedTypes'])}")
    lines.extend(f"- {note}" for note in audit["notes"])
    path.write_text("\n".join(lines), encoding="utf-8")


def first(payload: dict[str, Any], keys: Iterable[str]) -> Any:
    for key in keys:
        if key in payload:
            return payload[key]
    return None


def nested(payload: dict[str, Any], keys: list[str]) -> Any:
    value: Any = payload
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value


def stringify(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def numeric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def one(con: duckdb.DuckDBPyConnection, query: str) -> dict[str, Any]:
    cursor = con.execute(query)
    columns = [column[0] for column in cursor.description]
    row = cursor.fetchone()
    return dict(zip(columns, row or []))


def many(con: duckdb.DuckDBPyConnection, query: str) -> list[dict[str, Any]]:
    cursor = con.execute(query)
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


if __name__ == "__main__":
    main()
