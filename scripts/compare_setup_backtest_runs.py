#!/usr/bin/env python3
"""
Compara dois runs de setup-backtest.

Uso:
python scripts/compare_setup_backtest_runs.py \
  --base-dir research-output/setup-backtests/log-snapshots-gamma-binance-1s \
  --candidate-dir research-output/setup-backtests/outro-pc-run \
  --output-dir research-output/setup-backtests/compare-local-vs-other
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
from pathlib import Path
from typing import Any


SUMMARY_FILE = "setup-backtest-summary.csv"
PERIOD_FILE = "setup-backtest-period-summary.csv"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-dir", required=True, help="Diretorio do run base.")
    parser.add_argument("--candidate-dir", required=True, help="Diretorio do run candidato/out-of-sample.")
    parser.add_argument("--output-dir", required=True, help="Diretorio de saida da comparacao.")
    parser.add_argument("--min-trades", type=int, default=20)
    parser.add_argument("--label-base", default="base")
    parser.add_argument("--label-candidate", default="candidate")
    args = parser.parse_args()

    base_dir = Path(args.base_dir)
    candidate_dir = Path(args.candidate_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    base = read_summary(base_dir / SUMMARY_FILE)
    candidate = read_summary(candidate_dir / SUMMARY_FILE)
    comparison = compare_summaries(base, candidate, args.min_trades)
    period_comparison = compare_periods(
        read_optional_summary(base_dir / PERIOD_FILE),
        read_optional_summary(candidate_dir / PERIOD_FILE),
    )
    payload = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "baseDir": str(base_dir),
        "candidateDir": str(candidate_dir),
        "labelBase": args.label_base,
        "labelCandidate": args.label_candidate,
        "minTrades": args.min_trades,
        "comparison": comparison,
        "periodComparison": period_comparison,
    }

    write_csv(output_dir / "setup-run-comparison.csv", comparison)
    write_csv(output_dir / "setup-run-period-comparison.csv", period_comparison)
    (output_dir / "setup-run-comparison.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(output_dir / "setup-run-comparison.md", payload)

    survivors = [row for row in comparison if row["survives"]]
    print(json.dumps({
        "ok": True,
        "outputDir": str(output_dir),
        "setupsCompared": len(comparison),
        "survivors": len(survivors),
        "minTrades": args.min_trades,
    }, indent=2, ensure_ascii=False))


def read_summary(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"missing summary file: {path}")
    rows = read_csv(path)
    return {str(row["setupName"]): row for row in rows}


def read_optional_summary(path: Path) -> list[dict[str, Any]]:
    return read_csv(path) if path.exists() else []


def read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as f:
        return [normalize_row(row) for row in csv.DictReader(f)]


def normalize_row(row: dict[str, str]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in row.items():
        if value is None or value == "":
            normalized[key] = None
        elif key in {
            "trades",
            "wins",
        }:
            normalized[key] = int(float(value))
        elif key in {
            "winRate",
            "avgEntryPrice",
            "evPerTrade",
            "roi",
            "totalPnl",
            "maxDrawdown",
            "profitFactor",
            "avgSecondsRemaining",
            "avgDistanceBps",
            "avgDistanceSigma",
            "avgCrossesInWindow",
            "avgSecondsSinceLastCross",
            "avgMomentumBps",
        }:
            normalized[key] = parse_float(value)
        else:
            normalized[key] = value
    return normalized


def compare_summaries(
    base: dict[str, dict[str, Any]],
    candidate: dict[str, dict[str, Any]],
    min_trades: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for setup in sorted(set(base) | set(candidate)):
        left = base.get(setup, {})
        right = candidate.get(setup, {})
        row = {
            "setupName": setup,
            "family": first_non_empty(right.get("family"), left.get("family")),
            "baseTrades": as_int(left.get("trades")),
            "candidateTrades": as_int(right.get("trades")),
            "baseWinRate": left.get("winRate"),
            "candidateWinRate": right.get("winRate"),
            "deltaWinRate": delta(right.get("winRate"), left.get("winRate")),
            "baseEvPerTrade": left.get("evPerTrade"),
            "candidateEvPerTrade": right.get("evPerTrade"),
            "deltaEvPerTrade": delta(right.get("evPerTrade"), left.get("evPerTrade")),
            "baseRoi": left.get("roi"),
            "candidateRoi": right.get("roi"),
            "deltaRoi": delta(right.get("roi"), left.get("roi")),
            "baseTotalPnl": left.get("totalPnl"),
            "candidateTotalPnl": right.get("totalPnl"),
            "deltaTotalPnl": delta(right.get("totalPnl"), left.get("totalPnl")),
            "baseMaxDrawdown": left.get("maxDrawdown"),
            "candidateMaxDrawdown": right.get("maxDrawdown"),
            "deltaMaxDrawdown": delta(right.get("maxDrawdown"), left.get("maxDrawdown")),
        }
        row["survives"] = bool(
            row["baseTrades"] >= min_trades
            and row["candidateTrades"] >= min_trades
            and numeric_positive(row["baseEvPerTrade"])
            and numeric_positive(row["candidateEvPerTrade"])
            and numeric_positive(row["baseTotalPnl"])
            and numeric_positive(row["candidateTotalPnl"])
        )
        rows.append(row)
    rows.sort(key=lambda row: (
        not row["survives"],
        -(row["candidateEvPerTrade"] or -999),
        -(row["candidateTotalPnl"] or -999),
        row["setupName"],
    ))
    return rows


def compare_periods(base_rows: list[dict[str, Any]], candidate_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base = {(row.get("period"), row.get("setupName")): row for row in base_rows}
    candidate = {(row.get("period"), row.get("setupName")): row for row in candidate_rows}
    rows: list[dict[str, Any]] = []
    for period, setup in sorted(set(base) | set(candidate)):
        left = base.get((period, setup), {})
        right = candidate.get((period, setup), {})
        rows.append({
            "period": period,
            "setupName": setup,
            "family": first_non_empty(right.get("family"), left.get("family")),
            "baseTrades": as_int(left.get("trades")),
            "candidateTrades": as_int(right.get("trades")),
            "baseEvPerTrade": left.get("evPerTrade"),
            "candidateEvPerTrade": right.get("evPerTrade"),
            "deltaEvPerTrade": delta(right.get("evPerTrade"), left.get("evPerTrade")),
            "baseTotalPnl": left.get("totalPnl"),
            "candidateTotalPnl": right.get("totalPnl"),
            "deltaTotalPnl": delta(right.get("totalPnl"), left.get("totalPnl")),
        })
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    comparison = payload["comparison"]
    survivors = [row for row in comparison if row["survives"]]
    improved = [
        row for row in comparison
        if (row["candidateEvPerTrade"] is not None and row["baseEvPerTrade"] is not None and row["deltaEvPerTrade"] > 0)
    ]
    degraded = [
        row for row in comparison
        if (row["candidateEvPerTrade"] is not None and row["baseEvPerTrade"] is not None and row["deltaEvPerTrade"] < 0)
    ]
    lines = [
        "# Setup Backtest Run Comparison",
        "",
        f"Generated: `{payload['generatedAt']}`",
        f"Base: `{payload['baseDir']}`",
        f"Candidate: `{payload['candidateDir']}`",
        f"Minimum trades for survivor: `{payload['minTrades']}`",
        "",
        "## Summary",
        "",
        f"- Setups compared: {len(comparison)}",
        f"- Survivors: {len(survivors)}",
        f"- Improved EV/trade: {len(improved)}",
        f"- Degraded EV/trade: {len(degraded)}",
        "",
        "## Survivors",
        "",
    ]
    if survivors:
        lines.extend(format_row(row) for row in survivors)
    else:
        lines.append("- None")
    lines.extend(["", "## Top Candidate EV", ""])
    for row in sorted(comparison, key=lambda item: item["candidateEvPerTrade"] if item["candidateEvPerTrade"] is not None else -999, reverse=True)[:15]:
        lines.append(format_row(row))
    lines.extend(["", "## Largest EV Degradation", ""])
    for row in sorted(degraded, key=lambda item: item["deltaEvPerTrade"])[:15]:
        lines.append(format_row(row))
    path.write_text("\n".join(lines), encoding="utf-8")


def format_row(row: dict[str, Any]) -> str:
    return (
        f"- `{row['setupName']}`: base {row['baseTrades']} trades EV {fmt(row['baseEvPerTrade'])} "
        f"PnL {fmt(row['baseTotalPnl'])}; candidate {row['candidateTrades']} trades "
        f"EV {fmt(row['candidateEvPerTrade'])} PnL {fmt(row['candidateTotalPnl'])}; "
        f"delta EV {fmt(row['deltaEvPerTrade'])}"
    )


def parse_float(value: str) -> float | None:
    if value == "Infinity":
        return float("inf")
    if value == "-Infinity":
        return float("-inf")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def delta(candidate: Any, base: Any) -> float | None:
    if candidate is None or base is None:
        return None
    return float(candidate) - float(base)


def as_int(value: Any) -> int:
    if value is None:
        return 0
    return int(value)


def numeric_positive(value: Any) -> bool:
    return value is not None and float(value) > 0


def first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.4f}"


if __name__ == "__main__":
    main()
