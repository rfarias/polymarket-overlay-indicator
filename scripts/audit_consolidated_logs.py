#!/usr/bin/env python3
"""
Audita qualidade temporal e cobertura dos logs consolidados.

O objetivo e responder se os logs atuais ja sao bons para analise de setup ou
se ainda servem principalmente para validar pipeline.
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
    parser.add_argument("--logs-db", default="data/research/polymarket_bot_logs.duckdb")
    parser.add_argument("--btc5-db", default="data/research/btc5_research.duckdb")
    parser.add_argument("--output", default="research-output/log-audit/current_logs_quality.json")
    args = parser.parse_args()

    logs_db = Path(args.logs_db)
    btc5_db = Path(args.btc5_db)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect(str(logs_db), read_only=True)
    if btc5_db.exists():
        con.execute(f"ATTACH '{sql_path(btc5_db)}' AS btc5 (READ_ONLY)")

    create_views(con, has_btc5=btc5_db.exists())
    audit = collect_audit(con, logs_db, btc5_db if btc5_db.exists() else None)
    output.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(output.with_suffix(".md"), audit)

    print(json.dumps({
        "ok": True,
        "output": str(output),
        "markdown": str(output.with_suffix(".md")),
        "events": audit["summary"]["events"],
        "distinctSlugs": audit["summary"]["distinctSlugs"],
        "btc5MatchedResolvedSlugs": audit.get("btc5Cross", {}).get("summary", {}).get("matchedResolvedSlugs"),
    }, indent=2, ensure_ascii=False))


def create_views(con: duckdb.DuckDBPyConnection, has_btc5: bool) -> None:
    con.execute("""
        CREATE OR REPLACE TEMP VIEW normalized_events AS
        SELECT
            *,
            CASE
                WHEN event_ts IS NULL OR event_ts = '' THEN NULL
                WHEN regexp_matches(event_ts, '^[0-9]+(\\.[0-9]+)?$') THEN
                    CASE
                        WHEN CAST(event_ts AS DOUBLE) > 100000000000 THEN CAST(event_ts AS DOUBLE) / 1000
                        ELSE CAST(event_ts AS DOUBLE)
                    END
                ELSE epoch(try_cast(event_ts AS TIMESTAMP))
            END AS event_ts_sec
        FROM research.raw_events
    """)
    con.execute("""
        CREATE OR REPLACE TEMP VIEW normalized_events_time AS
        SELECT
            *,
            CASE WHEN event_ts_sec IS NULL THEN NULL ELSE to_timestamp(event_ts_sec) END AS event_time
        FROM normalized_events
    """)
    if has_btc5:
        con.execute("""
            CREATE OR REPLACE TEMP VIEW btc5_slug_cross AS
            SELECT
                e.family,
                e.paper_or_real,
                e.event_type,
                e.event_ts_sec,
                e.slug,
                e.is_closed,
                e.source_file,
                m.market_id AS btc5_market_id,
                m.result AS btc5_result,
                m.start_ts AS btc5_start_ts,
                m.end_ts AS btc5_end_ts,
                r.market_id AS resolved_market_id,
                CASE WHEN m.market_id IS NOT NULL THEN TRUE ELSE FALSE END AS matched_btc5_market,
                CASE WHEN r.market_id IS NOT NULL THEN TRUE ELSE FALSE END AS matched_btc5_resolved,
                CASE
                    WHEN e.event_ts_sec IS NULL OR m.market_id IS NULL THEN NULL
                    WHEN e.event_ts_sec BETWEEN m.start_ts AND m.end_ts THEN TRUE
                    ELSE FALSE
                END AS event_inside_market_window
            FROM normalized_events e
            LEFT JOIN btc5.research.btc5_markets m ON e.slug IS NOT NULL AND e.slug != '' AND m.slug IS NOT NULL AND m.slug != '' AND e.slug = m.slug
            LEFT JOIN btc5.research.btc5_markets_resolved r ON e.slug IS NOT NULL AND e.slug != '' AND r.slug IS NOT NULL AND r.slug != '' AND e.slug = r.slug
        """)


def collect_audit(con: duckdb.DuckDBPyConnection, logs_db: Path, btc5_db: Path | None) -> dict[str, Any]:
    summary = one(con, """
        SELECT
            COUNT(*) AS events,
            COUNT(*) FILTER (WHERE event_ts_sec IS NOT NULL) AS eventsWithTimestamp,
            COUNT(*) FILTER (WHERE event_ts_sec IS NULL) AS eventsMissingTimestamp,
            COUNT(*) FILTER (WHERE slug IS NOT NULL AND slug != '') AS eventsWithSlug,
            COUNT(*) FILTER (WHERE slug IS NULL OR slug = '') AS eventsMissingSlug,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS distinctSlugs,
            COUNT(DISTINCT slug) FILTER (WHERE slug LIKE 'btc-updown-5m-%') AS distinctBtc5Slugs,
            COUNT(*) FILTER (WHERE is_closed) AS closedEvents,
            MIN(event_ts_sec) AS minEventTs,
            MAX(event_ts_sec) AS maxEventTs
        FROM normalized_events
    """)
    summary["minEventUtc"] = utc_iso(summary.get("minEventTs"))
    summary["maxEventUtc"] = utc_iso(summary.get("maxEventTs"))

    manifest = one(con, """
        SELECT
            COUNT(*) AS files,
            COUNT(*) FILTER (WHERE NOT duplicate_raw) AS importedFiles,
            COUNT(*) FILTER (WHERE duplicate_raw) AS duplicateFiles,
            SUM(size_bytes_raw) AS rawBytes
        FROM research.log_files
    """)
    by_family = many(con, """
        SELECT
            family,
            COUNT(*) AS events,
            COUNT(*) FILTER (WHERE event_ts_sec IS NOT NULL) AS eventsWithTimestamp,
            COUNT(*) FILTER (WHERE slug IS NOT NULL AND slug != '') AS eventsWithSlug,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS distinctSlugs,
            COUNT(DISTINCT slug) FILTER (WHERE slug LIKE 'btc-updown-5m-%') AS distinctBtc5Slugs,
            COUNT(*) FILTER (WHERE is_closed) AS closedEvents,
            MIN(event_ts_sec) AS minEventTs,
            MAX(event_ts_sec) AS maxEventTs
        FROM normalized_events
        GROUP BY family
        ORDER BY events DESC
    """)
    for row in by_family:
        row["minEventUtc"] = utc_iso(row.get("minEventTs"))
        row["maxEventUtc"] = utc_iso(row.get("maxEventTs"))

    by_day = many(con, """
        SELECT
            CAST(date_trunc('day', event_time) AS VARCHAR) AS day,
            COUNT(*) AS events,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS slugs,
            COUNT(*) FILTER (WHERE is_closed) AS closedEvents
        FROM normalized_events_time
        WHERE event_time IS NOT NULL
        GROUP BY day
        ORDER BY day
    """)
    by_family_day = many(con, """
        SELECT
            family,
            CAST(date_trunc('day', event_time) AS VARCHAR) AS day,
            COUNT(*) AS events,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS slugs
        FROM normalized_events_time
        WHERE event_time IS NOT NULL
        GROUP BY family, day
        ORDER BY day, family
    """)
    top_gaps = many(con, """
        WITH ordered AS (
            SELECT
                family,
                event_ts_sec,
                lag(event_ts_sec) OVER (PARTITION BY family ORDER BY event_ts_sec) AS prev_ts
            FROM (
                SELECT DISTINCT family, event_ts_sec
                FROM normalized_events
                WHERE event_ts_sec IS NOT NULL
            )
        )
        SELECT
            family,
            prev_ts,
            event_ts_sec,
            event_ts_sec - prev_ts AS gapSeconds
        FROM ordered
        WHERE prev_ts IS NOT NULL AND event_ts_sec - prev_ts > 3600
        ORDER BY gapSeconds DESC
        LIMIT 30
    """)
    for row in top_gaps:
        row["prevUtc"] = utc_iso(row.get("prev_ts"))
        row["nextUtc"] = utc_iso(row.get("event_ts_sec"))

    missing_quality = many(con, """
        SELECT
            family,
            COUNT(*) FILTER (WHERE event_ts_sec IS NULL) AS missingTimestamp,
            COUNT(*) FILTER (WHERE slug IS NULL OR slug = '') AS missingSlug,
            COUNT(*) FILTER (WHERE event_type IS NULL OR event_type = '') AS missingEventType,
            COUNT(*) AS events
        FROM normalized_events
        GROUP BY family
        ORDER BY events DESC
    """)

    audit: dict[str, Any] = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "logsDatabase": str(logs_db),
        "btc5Database": str(btc5_db) if btc5_db else None,
        "summary": summary,
        "manifest": manifest,
        "byFamily": by_family,
        "byDay": by_day,
        "byFamilyDay": by_family_day,
        "topTemporalGaps": top_gaps,
        "missingQualityByFamily": missing_quality,
    }

    if btc5_db:
        audit["btc5Cross"] = collect_btc5_cross(con)
    audit["decision"] = build_decision(audit)
    return audit


def collect_btc5_cross(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    summary = one(con, """
        SELECT
            COUNT(*) AS logEvents,
            COUNT(*) FILTER (WHERE matched_btc5_market) AS eventsMatchedAnyBtc5,
            COUNT(*) FILTER (WHERE matched_btc5_resolved) AS eventsMatchedResolvedBtc5,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS logSlugs,
            COUNT(DISTINCT slug) FILTER (WHERE matched_btc5_market) AS matchedAnySlugs,
            COUNT(DISTINCT slug) FILTER (WHERE matched_btc5_resolved) AS matchedResolvedSlugs,
            COUNT(*) FILTER (WHERE event_inside_market_window) AS eventsInsideMarketWindow,
            COUNT(DISTINCT slug) FILTER (WHERE event_inside_market_window) AS slugsInsideMarketWindow,
            COUNT(*) FILTER (WHERE is_closed AND matched_btc5_resolved) AS closedEventsMatchedResolved
        FROM btc5_slug_cross
    """)
    by_family = many(con, """
        SELECT
            family,
            COUNT(*) AS events,
            COUNT(DISTINCT slug) FILTER (WHERE slug IS NOT NULL AND slug != '') AS slugs,
            COUNT(*) FILTER (WHERE matched_btc5_market) AS eventsMatchedAny,
            COUNT(*) FILTER (WHERE matched_btc5_resolved) AS eventsMatchedResolved,
            COUNT(DISTINCT slug) FILTER (WHERE matched_btc5_market) AS slugsMatchedAny,
            COUNT(DISTINCT slug) FILTER (WHERE matched_btc5_resolved) AS slugsMatchedResolved,
            COUNT(*) FILTER (WHERE event_inside_market_window) AS eventsInsideMarketWindow,
            COUNT(*) FILTER (WHERE is_closed AND matched_btc5_resolved) AS closedMatchedResolved
        FROM btc5_slug_cross
        GROUP BY family
        ORDER BY events DESC
    """)
    unmatched_btc5_examples = many(con, """
        SELECT slug, COUNT(*) AS events, MIN(family) AS exampleFamily
        FROM btc5_slug_cross
        WHERE slug LIKE 'btc-updown-5m-%' AND NOT matched_btc5_market
        GROUP BY slug
        ORDER BY events DESC, slug
        LIMIT 30
    """)
    matched_resolved_by_day = many(con, """
        SELECT
            CAST(date_trunc('day', to_timestamp(event_ts_sec)) AS VARCHAR) AS day,
            COUNT(*) AS events,
            COUNT(DISTINCT slug) AS slugs,
            COUNT(*) FILTER (WHERE is_closed) AS closedEvents
        FROM btc5_slug_cross
        WHERE matched_btc5_resolved AND event_ts_sec IS NOT NULL
        GROUP BY day
        ORDER BY day
    """)
    return {
        "summary": summary,
        "byFamily": by_family,
        "unmatchedBtc5SlugExamples": unmatched_btc5_examples,
        "matchedResolvedByDay": matched_resolved_by_day,
    }


def build_decision(audit: dict[str, Any]) -> dict[str, Any]:
    summary = audit["summary"]
    cross = audit.get("btc5Cross", {}).get("summary", {})
    matched_resolved = cross.get("matchedResolvedSlugs") or 0
    closed_matched = cross.get("closedEventsMatchedResolved") or 0
    distinct_slugs = summary.get("distinctSlugs") or 0
    missing_ts = summary.get("eventsMissingTimestamp") or 0
    events = summary.get("events") or 0
    missing_ts_rate = missing_ts / events if events else 0

    blockers: list[str] = []
    if matched_resolved < 100:
        blockers.append("Poucos slugs dos logs cruzam com mercados BTC 5m resolvidos.")
    if closed_matched < 100:
        blockers.append("Poucos eventos fechados cruzam com mercados BTC 5m resolvidos.")
    if missing_ts_rate > 0.10:
        blockers.append("Muitos eventos sem timestamp normalizavel.")
    if distinct_slugs < 1000:
        blockers.append("Baixa diversidade de slugs nos logs.")

    if blockers:
        status = "pipeline_validation_only"
        recommendation = "Usar esta base para validar pipeline e cobertura; nao concluir edge ainda."
    else:
        status = "ready_for_joined_setup_analysis"
        recommendation = "A base parece suficiente para uma primeira analise cruzada de setups, ainda com validacao fora da amostra."

    return {
        "status": status,
        "recommendation": recommendation,
        "blockers": blockers,
    }


def write_markdown(path: Path, audit: dict[str, Any]) -> None:
    summary = audit["summary"]
    manifest = audit["manifest"]
    decision = audit["decision"]
    lines = [
        "# Current Logs Quality Audit",
        "",
        f"Generated: `{audit['generatedAt']}`",
        f"Logs DB: `{audit['logsDatabase']}`",
        f"BTC5 DB: `{audit['btc5Database']}`",
        "",
        "## Decision",
        "",
        f"- Status: `{decision['status']}`",
        f"- Recommendation: {decision['recommendation']}",
    ]
    if decision["blockers"]:
        lines.append("- Blockers:")
        lines.extend(f"  - {blocker}" for blocker in decision["blockers"])

    lines.extend([
        "",
        "## Summary",
        "",
        f"- Files: {manifest.get('files', 0)} discovered, {manifest.get('importedFiles', 0)} imported, {manifest.get('duplicateFiles', 0)} duplicates",
        f"- Events: {summary.get('events', 0)}",
        f"- Events with timestamp: {summary.get('eventsWithTimestamp', 0)}",
        f"- Events missing timestamp: {summary.get('eventsMissingTimestamp', 0)}",
        f"- Events with slug: {summary.get('eventsWithSlug', 0)}",
        f"- Events missing slug: {summary.get('eventsMissingSlug', 0)}",
        f"- Distinct slugs: {summary.get('distinctSlugs', 0)}",
        f"- Distinct BTC 5m slugs: {summary.get('distinctBtc5Slugs', 0)}",
        f"- Closed events: {summary.get('closedEvents', 0)}",
        f"- Time span: {summary.get('minEventUtc')} to {summary.get('maxEventUtc')}",
        "",
        "## By Family",
        "",
    ])
    for row in audit["byFamily"]:
        lines.append(
            f"- {row['family']}: {row['events']} events, {row['distinctSlugs']} slugs, "
            f"{row['distinctBtc5Slugs']} BTC5 slugs, {row['closedEvents']} closed, "
            f"{row['minEventUtc']} to {row['maxEventUtc']}"
        )

    cross = audit.get("btc5Cross")
    if cross:
        cross_summary = cross["summary"]
        lines.extend([
            "",
            "## BTC5 Cross",
            "",
            f"- Log slugs: {cross_summary.get('logSlugs', 0)}",
            f"- Slugs matched any BTC5 market: {cross_summary.get('matchedAnySlugs', 0)}",
            f"- Slugs matched resolved BTC5 market: {cross_summary.get('matchedResolvedSlugs', 0)}",
            f"- Events matched any BTC5 market: {cross_summary.get('eventsMatchedAnyBtc5', 0)}",
            f"- Events matched resolved BTC5 market: {cross_summary.get('eventsMatchedResolvedBtc5', 0)}",
            f"- Events inside BTC5 market window: {cross_summary.get('eventsInsideMarketWindow', 0)}",
            f"- Closed events matched resolved BTC5: {cross_summary.get('closedEventsMatchedResolved', 0)}",
            "",
            "### BTC5 Cross By Family",
            "",
        ])
        for row in cross["byFamily"]:
            lines.append(
                f"- {row['family']}: {row['slugsMatchedResolved']} resolved slugs, "
                f"{row['eventsMatchedResolved']} resolved events, "
                f"{row['eventsInsideMarketWindow']} events inside window, "
                f"{row['closedMatchedResolved']} closed resolved"
            )

    lines.extend([
        "",
        "## Daily Coverage",
        "",
    ])
    for row in audit["byDay"]:
        lines.append(f"- {row['day']}: {row['events']} events, {row['slugs']} slugs, {row['closedEvents']} closed")

    lines.extend([
        "",
        "## Largest Temporal Gaps",
        "",
    ])
    for row in audit["topTemporalGaps"][:10]:
        hours = (row["gapSeconds"] or 0) / 3600
        lines.append(f"- {row['family']}: {hours:.1f}h from {row['prevUtc']} to {row['nextUtc']}")

    path.write_text("\n".join(lines), encoding="utf-8")


def sql_path(path: Path) -> str:
    return str(path).replace("'", "''")


def utc_iso(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc).isoformat()
    except (OverflowError, OSError, TypeError, ValueError):
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
