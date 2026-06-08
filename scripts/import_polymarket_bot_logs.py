#!/usr/bin/env python3
"""
Importa logs paper/observer do polymarket-bot para DuckDB.

Suporta:
- multiplos --source-dir
- .jsonl, .jsonl.gz, .log e .log.gz com linhas JSON
- manifest por arquivo com hashes, timestamps e contagem de eventos
- deduplicacao por sha256 do conteudo bruto descompactado

O script preserva o payload JSON bruto e extrai campos comuns para auditoria.
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, TextIO

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

ORDER_TYPES = {
    "order",
    "order_created",
    "order_submitted",
    "order_cancelled",
    "order_canceled",
    "order_filled",
    "real_order",
}

FILL_TYPES = {
    "fill",
    "filled",
    "trade_fill",
    "real_fill",
}

LOG_SUFFIXES = {
    ".jsonl",
    ".log",
    ".out.log",
    ".err.log",
}


@dataclass
class SourceRoot:
    index: int
    path: Path
    name: str


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        action="append",
        required=True,
        help="Raiz de projeto ou diretorio contendo logs. Pode ser informado mais de uma vez.",
    )
    parser.add_argument("--output-db", default="data/research/polymarket_bot_logs.duckdb")
    parser.add_argument("--audit-output", default="research-output/log-audit/polymarket_bot_logs_audit.json")
    parser.add_argument("--manifest-output", help="Caminho base opcional para manifest. Gera .csv e .json.")
    args = parser.parse_args()

    source_roots = [
        SourceRoot(index=i, path=Path(value).resolve(), name=Path(value).resolve().name)
        for i, value in enumerate(args.source_dir, start=1)
    ]
    output_db = Path(args.output_db)
    audit_output = Path(args.audit_output)
    output_db.parent.mkdir(parents=True, exist_ok=True)
    audit_output.parent.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    log_files: list[dict[str, Any]] = []
    seen_raw_hashes: set[str] = set()

    for source in source_roots:
        for path in discover_log_files(source.path):
            scan = scan_log_file(path, source)
            duplicate = scan["sha256_raw"] in seen_raw_hashes
            scan["duplicate_raw"] = duplicate
            log_files.append(scan)
            if duplicate:
                continue
            seen_raw_hashes.add(scan["sha256_raw"])
            rows.extend(read_events(path, source, scan))

    con = duckdb.connect(str(output_db))
    create_tables(con)
    insert_tables(con, log_files, rows)
    audit = collect_audit(con, output_db, source_roots)
    audit_output.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown_audit(audit_output.with_suffix(".md"), audit)
    manifest_output = Path(args.manifest_output) if args.manifest_output else audit_output.with_name(audit_output.stem.replace("_audit", "") + "_manifest.csv")
    write_manifest_files(manifest_output, log_files)

    print(json.dumps({
        "ok": True,
        "db": str(output_db),
        "audit": str(audit_output),
        "manifest": str(manifest_output),
        "sourceDirs": [str(source.path) for source in source_roots],
        "files": audit["summary"]["files"],
        "importedFiles": audit["summary"]["importedFiles"],
        "duplicateFiles": audit["summary"]["duplicateFiles"],
        "events": audit["summary"]["events"],
        "closedEvents": audit["summary"]["closedEvents"],
    }, indent=2, ensure_ascii=False))


def discover_log_files(source_dir: Path) -> list[Path]:
    if not source_dir.exists():
        raise FileNotFoundError(f"source dir not found: {source_dir}")

    candidates: list[Path] = []
    search_root = source_dir / "logs" if (source_dir / "logs").is_dir() else source_dir
    for path in search_root.rglob("*"):
        if not path.is_file():
            continue
        name = path.name.lower()
        if any(name.endswith(suffix) for suffix in LOG_SUFFIXES):
            candidates.append(path)
            continue
        if any(name.endswith(f"{suffix}.gz") for suffix in LOG_SUFFIXES):
            candidates.append(path)
            continue
        if "multi_coin_observer" in str(path).lower() and path.suffix == "":
            candidates.append(path)
    return sorted(set(candidates))


def scan_log_file(path: Path, source: SourceRoot) -> dict[str, Any]:
    sha_raw = hashlib.sha256()
    line_count = 0
    event_count = 0
    first_ts: str | None = None
    last_ts: str | None = None

    with open_text(path) as f:
        for line in f:
            encoded = line.encode("utf-8", errors="replace")
            sha_raw.update(encoded)
            line_count += 1
            text = line.strip()
            if not text:
                continue
            event_count += 1
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                continue
            ts = stringify(first(payload, ["ts", "timestamp", "time", "observed_at", "observedAt", "created_at", "createdAt"]))
            if ts:
                first_ts = first_ts or ts
                last_ts = ts

    return {
        "source_index": source.index,
        "source_name": source.name,
        "source_dir": str(source.path),
        "source_project": source.name,
        "source_path": str(path),
        "repo_relative_path": safe_relative(path, source.path),
        "family": infer_family(path),
        "file_name": path.name,
        "extension": logical_extension(path),
        "compressed": path.name.lower().endswith(".gz"),
        "size_bytes_raw": size_bytes_raw(path),
        "size_bytes_compressed": path.stat().st_size if path.name.lower().endswith(".gz") else None,
        "sha256_raw": sha_raw.hexdigest(),
        "sha256_compressed": sha256_file(path) if path.name.lower().endswith(".gz") else None,
        "line_count": line_count,
        "event_count": event_count,
        "first_timestamp": first_ts,
        "last_timestamp": last_ts,
        "created_at": utc_now(),
        "imported_at": utc_now(),
        "duplicate_raw": False,
    }


def read_events(path: Path, source: SourceRoot, file_info: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open_text(path) as f:
        for line_no, line in enumerate(f, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as exc:
                payload = {"type": "json_parse_error", "error": str(exc), "raw": text[:500]}
            rows.append(normalize_event(source, file_info, line_no, payload))
    return rows


def normalize_event(source: SourceRoot, file_info: dict[str, Any], line_no: int, payload: dict[str, Any]) -> dict[str, Any]:
    event_type = str(first(payload, ["type", "event", "kind"]) or "")
    ts_value = first(payload, ["ts", "timestamp", "time", "observed_at", "observedAt", "created_at", "createdAt"])
    slug = first(payload, ["slug", "market_slug", "marketSlug", "current_slug", "currentSlug"])
    market_id = first(payload, ["market_id", "marketId", "condition_id", "conditionId"])
    token_id = first(payload, ["token_id", "tokenId", "asset_id", "assetId"])
    strategy_name = first(payload, ["strategy", "strategy_name", "strategyName", "setup", "setup_name", "setupName"])
    runner_name = first(payload, ["runner", "runner_name", "runnerName"])
    side = first(payload, ["side", "outcome", "direction"]) or nested(payload, ["ee", "entry_side"])
    pnl = numeric(first(payload, ["pnl", "net_pnl", "netPnl", "realized_pnl", "realizedPnl"]) or nested(payload, ["ee", "pnl"]))
    price = numeric(first(payload, ["price", "entry_price", "entryPrice", "avg_price", "avgPrice"]) or nested(payload, ["ee", "entry_ep"]))
    size = numeric(first(payload, ["size", "qty", "quantity", "shares"]) or nested(payload, ["ee", "qty"]))
    paper_or_real = infer_paper_or_real(file_info["family"], payload)
    return {
        "source_index": source.index,
        "source_name": source.name,
        "source_file": file_info["repo_relative_path"],
        "source_path": file_info["source_path"],
        "file_sha256_raw": file_info["sha256_raw"],
        "family": file_info["family"],
        "line_no": line_no,
        "event_type": event_type,
        "event_ts": stringify(ts_value),
        "market_id": stringify(market_id),
        "condition_id": stringify(market_id),
        "token_id": stringify(token_id),
        "slug": stringify(slug),
        "strategy_name": stringify(strategy_name),
        "runner_name": stringify(runner_name),
        "paper_or_real": paper_or_real,
        "side": stringify(side),
        "pnl": pnl,
        "price": price,
        "size": size,
        "is_closed": event_type in CLOSED_TYPES,
        "is_order": event_type in ORDER_TYPES,
        "is_fill": event_type in FILL_TYPES,
        "payload_json": json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
    }


def create_tables(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA IF NOT EXISTS research")
    con.execute("""
        CREATE OR REPLACE TABLE research.log_files (
            source_index INTEGER,
            source_name VARCHAR,
            source_dir VARCHAR,
            source_project VARCHAR,
            source_path VARCHAR,
            repo_relative_path VARCHAR,
            family VARCHAR,
            file_name VARCHAR,
            extension VARCHAR,
            compressed BOOLEAN,
            size_bytes_raw BIGINT,
            size_bytes_compressed BIGINT,
            sha256_raw VARCHAR,
            sha256_compressed VARCHAR,
            line_count BIGINT,
            event_count BIGINT,
            first_timestamp VARCHAR,
            last_timestamp VARCHAR,
            created_at VARCHAR,
            imported_at VARCHAR,
            duplicate_raw BOOLEAN
        )
    """)
    con.execute("""
        CREATE OR REPLACE TABLE research.raw_events (
            source_index INTEGER,
            source_name VARCHAR,
            source_file VARCHAR,
            source_path VARCHAR,
            file_sha256_raw VARCHAR,
            family VARCHAR,
            line_no INTEGER,
            event_type VARCHAR,
            event_ts VARCHAR,
            market_id VARCHAR,
            condition_id VARCHAR,
            token_id VARCHAR,
            slug VARCHAR,
            strategy_name VARCHAR,
            runner_name VARCHAR,
            paper_or_real VARCHAR,
            side VARCHAR,
            pnl DOUBLE,
            price DOUBLE,
            size DOUBLE,
            is_closed BOOLEAN,
            is_order BOOLEAN,
            is_fill BOOLEAN,
            payload_json VARCHAR
        )
    """)


def insert_tables(con: duckdb.DuckDBPyConnection, log_files: list[dict[str, Any]], rows: list[dict[str, Any]]) -> None:
    if log_files:
        df_files = pd.DataFrame(log_files)
        con.register("log_files_import", df_files)
        con.execute("INSERT INTO research.log_files SELECT * FROM log_files_import")
        con.unregister("log_files_import")

    if rows:
        df_rows = pd.DataFrame(rows)
        con.register("raw_events_import", df_rows)
        con.execute("INSERT INTO research.raw_events SELECT * FROM raw_events_import")
        con.unregister("raw_events_import")

    con.execute("CREATE OR REPLACE TABLE research.source_manifest AS SELECT * FROM research.log_files")
    con.execute("""
        CREATE OR REPLACE TABLE research.paper_events AS
        SELECT *
        FROM research.raw_events
        WHERE paper_or_real IN ('paper', 'observer')
    """)
    con.execute("""
        CREATE OR REPLACE TABLE research.paper_closed_events AS
        SELECT *
        FROM research.paper_events
        WHERE is_closed
    """)
    con.execute("""
        CREATE OR REPLACE TABLE research.real_order_events AS
        SELECT *
        FROM research.raw_events
        WHERE paper_or_real = 'real' AND is_order
    """)
    con.execute("""
        CREATE OR REPLACE TABLE research.real_fill_events AS
        SELECT *
        FROM research.raw_events
        WHERE paper_or_real = 'real' AND is_fill
    """)
    con.execute("""
        CREATE OR REPLACE TABLE research.runner_sessions AS
        SELECT
            source_name,
            family,
            source_file,
            MIN(event_ts) AS first_event_ts,
            MAX(event_ts) AS last_event_ts,
            COUNT(*) AS events
        FROM research.raw_events
        GROUP BY source_name, family, source_file
    """)


def collect_audit(
    con: duckdb.DuckDBPyConnection,
    output_db: Path,
    source_roots: list[SourceRoot],
) -> dict[str, Any]:
    summary = one(con, """
        SELECT
            COUNT(*) AS files,
            SUM(CASE WHEN NOT duplicate_raw THEN 1 ELSE 0 END) AS importedFiles,
            SUM(CASE WHEN duplicate_raw THEN 1 ELSE 0 END) AS duplicateFiles,
            COALESCE(SUM(event_count), 0) AS discoveredEvents
        FROM research.log_files
    """)
    event_summary = one(con, """
        SELECT
            COUNT(*) AS events,
            SUM(CASE WHEN is_closed THEN 1 ELSE 0 END) AS closedEvents,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS slugs,
            COUNT(DISTINCT market_id) FILTER (WHERE market_id IS NOT NULL AND market_id != '') AS marketIds
        FROM research.raw_events
    """)
    summary.update(event_summary)
    by_family = many(con, """
        SELECT family, COUNT(DISTINCT source_file) AS files, COUNT(*) AS events,
               SUM(CASE WHEN is_closed THEN 1 ELSE 0 END) AS closedEvents
        FROM research.raw_events
        GROUP BY family
        ORDER BY family
    """)
    by_source = many(con, """
        SELECT source_name, COUNT(*) AS files,
               SUM(CASE WHEN NOT duplicate_raw THEN 1 ELSE 0 END) AS importedFiles,
               SUM(event_count) AS discoveredEvents
        FROM research.log_files
        GROUP BY source_name
        ORDER BY source_name
    """)
    by_type = many(con, """
        SELECT family, event_type, COUNT(*) AS events
        FROM research.raw_events
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
        "generatedAt": utc_now(),
        "database": str(output_db),
        "sourceDirs": [str(source.path) for source in source_roots],
        "summary": summary,
        "bySource": by_source,
        "byFamily": by_family,
        "topEventTypes": by_type,
        "closedPnl": closed_pnl,
        "closedTypes": sorted(CLOSED_TYPES),
        "tables": [
            "research.log_files",
            "research.source_manifest",
            "research.raw_events",
            "research.paper_events",
            "research.paper_closed_events",
            "research.real_order_events",
            "research.real_fill_events",
            "research.runner_sessions",
        ],
        "notes": [
            "Deduplication uses sha256_raw, calculated from uncompressed file content.",
            "Compressed files keep both sha256_raw and sha256_compressed in the manifest.",
            "payload_json preserves the original JSON event for deeper parsing later.",
            "Non-JSON lines are retained as json_parse_error events.",
        ],
    }


def write_markdown_audit(path: Path, audit: dict[str, Any]) -> None:
    summary = audit["summary"]
    source_text = ", ".join(f"`{escape_path(value)}`" for value in audit["sourceDirs"])
    lines = [
        "# Polymarket Bot Logs Audit",
        "",
        f"Database: `{audit['database']}`",
        f"Sources: {source_text}",
        "",
        "## Summary",
        "",
        f"- Files discovered: {summary.get('files', 0)}",
        f"- Files imported: {summary.get('importedFiles', 0)}",
        f"- Duplicate files skipped: {summary.get('duplicateFiles', 0)}",
        f"- Events imported: {summary.get('events', 0)}",
        f"- Closed events: {summary.get('closedEvents', 0)}",
        f"- Slugs: {summary.get('slugs', 0)}",
        f"- Market IDs: {summary.get('marketIds', 0)}",
        "",
        "## Tables",
        "",
    ]
    lines.extend(f"- `{table}`" for table in audit["tables"])
    lines.extend(["", "## By Source", ""])
    for row in audit["bySource"]:
        lines.append(
            f"- {row['source_name']}: {row['files']} files, "
            f"{row['importedFiles']} imported, {row['discoveredEvents']} discovered events"
        )
    lines.extend(["", "## By Family", ""])
    for row in audit["byFamily"]:
        lines.append(f"- {row['family']}: {row['files']} files, {row['events']} events, {row['closedEvents']} closed")
    lines.extend(["", "## Notes", ""])
    lines.append(f"- Closed event types: {', '.join(audit['closedTypes'])}")
    lines.extend(f"- {note}" for note in audit["notes"])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_manifest_files(csv_path: Path, log_files: list[dict[str, Any]]) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    json_path = csv_path.with_suffix(".json")
    df = pd.DataFrame(log_files)
    df.to_csv(csv_path, index=False)
    json_path.write_text(json.dumps(log_files, indent=2, ensure_ascii=False), encoding="utf-8")


def open_text(path: Path) -> TextIO:
    if path.name.lower().endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("r", encoding="utf-8", errors="replace")


def infer_family(path: Path) -> str:
    text = str(path).lower().replace("\\", "/")
    if "ee_paper" in text:
        return "ee_paper"
    if "el_flip_paper" in text:
        return "el_flip_paper"
    if "multi_coin_observer" in text:
        return "multi_coin_observer"
    if "observer" in text:
        return "observer"
    if "paper" in text:
        return "paper"
    if "fill" in text:
        return "real_fill"
    if "order" in text:
        return "real_order"
    return "unknown"


def infer_paper_or_real(family: str, payload: dict[str, Any]) -> str:
    explicit = stringify(first(payload, ["mode", "paper_or_real", "paperOrReal", "execution_mode", "executionMode"]))
    if explicit:
        lowered = explicit.lower()
        if "real" in lowered or "live" in lowered:
            return "real"
        if "paper" in lowered:
            return "paper"
        if "observe" in lowered:
            return "observer"
    if "observer" in family:
        return "observer"
    if "paper" in family:
        return "paper"
    if family.startswith("real_"):
        return "real"
    return "unknown"


def logical_extension(path: Path) -> str:
    name = path.name.lower()
    for suffix in [".jsonl.gz", ".log.gz", ".out.log.gz", ".err.log.gz", ".jsonl", ".out.log", ".err.log", ".log"]:
        if name.endswith(suffix):
            return suffix
    return path.suffix.lower()


def size_bytes_raw(path: Path) -> int:
    if not path.name.lower().endswith(".gz"):
        return path.stat().st_size
    size = 0
    with gzip.open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            size += len(chunk)
    return size


def sha256_file(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def safe_relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


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


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def escape_path(value: str) -> str:
    return value.encode("unicode_escape").decode("ascii")


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
