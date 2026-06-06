# Polymarket Bot Paper Logs

Logs relevantes no repositório `polymarket-bot`.

## Padrões principais

EE paper:

```text
logs/ee_paper_*/ee_paper.jsonl
```

EL Flip paper:

```text
logs/el_flip_paper_*/el_flip_paper.jsonl
```

Multi-coin observer:

```text
logs/multi_coin_observer_*/
```

## Carregamento simples em Python

```python
import glob, json

events = []
for path in sorted(glob.glob("logs/ee_paper_*/ee_paper.jsonl")):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))

closed = [e for e in events if e.get("type") in ("trade_closed", "flat", "redeem_flat")]
```

## Importador consolidado

Este projeto inclui um importador para materializar esses logs em DuckDB:

```bash
python scripts/import_polymarket_bot_logs.py \
  --source-dir "C:\Users\Romario\Desktop\BACKUP ROMÁRIO\documentos\polymarket-bot" \
  --output-db data/research/polymarket_bot_logs.duckdb \
  --audit-output research-output/log-audit/polymarket_bot_logs_audit.json
```

Tabelas:

- `research.paper_events`
- `research.paper_closed_events`

O campo `payload_json` preserva o evento original completo para parse mais específico depois.
