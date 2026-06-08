# Polymarket Bot Logs

Logs relevantes no repositorio `polymarket-bot`.

## Padroes principais

EE paper:

```text
logs/ee_paper_*/ee_paper.jsonl
logs/ee_paper_*/ee_paper.jsonl.gz
```

EL Flip paper:

```text
logs/el_flip_paper_*/el_flip_paper.jsonl
logs/el_flip_paper_*/el_flip_paper.jsonl.gz
```

Multi-coin observer:

```text
logs/multi_coin_observer_*/
```

O importador tambem aceita linhas JSON em `*.log`, `*.out.log`, `*.err.log` e variantes `.gz`.

## Importador consolidado

Este projeto materializa os logs em DuckDB, preservando o payload bruto e gerando manifest por arquivo:

```bash
python scripts/import_polymarket_bot_logs.py \
  --source-dir "C:\Users\Romario\Desktop\BACKUP ROMARIO\documentos\polymarket-bot" \
  --source-dir "data/raw-logs/other-pc/project-name" \
  --output-db data/research/consolidated_logs.duckdb \
  --audit-output research-output/log-audit/consolidated_logs_audit.json
```

Saidas:

- `data/research/consolidated_logs.duckdb`
- `research-output/log-audit/consolidated_logs_audit.json`
- `research-output/log-audit/consolidated_logs_audit.md`
- `research-output/log-audit/consolidated_logs_manifest.csv`
- `research-output/log-audit/consolidated_logs_manifest.json`

## Tabelas

- `research.log_files`: manifest por arquivo, com hash bruto/descompactado e flag de duplicidade.
- `research.source_manifest`: copia canonica do manifest para consultas.
- `research.raw_events`: todos os eventos importados.
- `research.paper_events`: eventos classificados como paper ou observer.
- `research.paper_closed_events`: subset fechado de paper.
- `research.real_order_events`: eventos reais de ordem, quando existirem.
- `research.real_fill_events`: eventos reais de fill, quando existirem.
- `research.runner_sessions`: resumo por arquivo/sessao.

O campo `payload_json` preserva o evento original completo para parse mais especifico depois.

## Deduplicacao

A chave de deduplicacao e `sha256_raw`, calculada sobre o conteudo descompactado. Assim, um mesmo log em `.jsonl` e `.jsonl.gz` entra apenas uma vez nos eventos, mas ambos aparecem no manifest.

## Auditoria de qualidade

Depois de importar, rode a auditoria temporal e o cruzamento com a base BTC 5m:

```bash
python scripts/audit_consolidated_logs.py \
  --logs-db data/research/polymarket_bot_logs.duckdb \
  --btc5-db data/research/btc5_research.duckdb \
  --output research-output/log-audit/current_logs_quality.json
```

Saidas:

- `research-output/log-audit/current_logs_quality.json`
- `research-output/log-audit/current_logs_quality.md`

No estado local de 2026-06-08, os logs atuais cobrem 6.507 slugs, mas 0 slugs cruzam com os mercados BTC 5m resolvidos da base `btc5_research.duckdb`. Portanto, a base atual ainda serve para validar pipeline/cobertura, nao para concluir edge.

## Metadata Gamma para slugs faltantes

Para slugs BTC5 presentes nos logs mas ausentes da base BTC5 local, busque metadata/resolucao pela Gamma API:

```bash
python scripts/fetch_gamma_btc5_metadata.py \
  --logs-db data/research/polymarket_bot_logs.duckdb \
  --btc5-db data/research/btc5_research.duckdb \
  --output-dir research-output/gamma-btc5-metadata \
  --closed-only \
  --workers 8
```

No lote fechado local:

- 261 slugs solicitados
- 261 encontrados na Gamma
- 261 com resultado inferido
- 255 com `priceToBeat` e `finalPrice`

Depois, avalie os fechamentos paper contra a resolucao Gamma:

```bash
python scripts/evaluate_closed_logs_with_gamma.py \
  --logs-db data/research/polymarket_bot_logs.duckdb \
  --gamma-metadata research-output/gamma-btc5-metadata/gamma_btc5_closed_metadata.json \
  --output-dir research-output/gamma-btc5-metadata
```

Resultado local:

- 517 eventos BTC5 fechados cruzados com Gamma
- 278 linhas com PnL parseavel
- PnL total: 18.48
- PnL medio: 0.06647
- taxa de PnL positivo: 75.18%
- lado escolhido bateu o resultado Gamma em 84.17%

Limite: isso valida os fechamentos paper contra o resultado final, mas ainda nao adiciona historico de book/odds para backtests robustos.

## Replay dos setups sobre snapshots dos logs

Para simular o catalogo de setups sobre os snapshots observados nos logs:

```bash
python scripts/fetch_gamma_btc5_metadata.py \
  --logs-db data/research/polymarket_bot_logs.duckdb \
  --btc5-db data/research/btc5_research.duckdb \
  --output-dir research-output/gamma-btc5-metadata \
  --workers 12

python scripts/build_setup_dataset_from_logs.py \
  --logs-db data/research/polymarket_bot_logs.duckdb \
  --gamma-metadata research-output/gamma-btc5-metadata/gamma_btc5_all_metadata.json \
  --output data/external-btc5/log-snapshots-gamma.dataset.json

npm run enrich-btc5-dataset -- \
  --input data/external-btc5/log-snapshots-gamma.dataset.json \
  --output data/external-btc5/log-snapshots-gamma.binance-enriched.json \
  --cache-file data/external-btc5/binance-btcusdt-1s-cache.json \
  --interval 1s

npm run setup-backtest -- \
  --input data/external-btc5/log-snapshots-gamma.binance-enriched.json \
  --output-dir research-output/setup-backtests/log-snapshots-gamma-binance-1s
```

Estado local:

- slugs BTC5 nos logs buscados na Gamma: 4.622
- slugs encontrados: 4.621
- mercados com `priceToBeat` utilizavel: 4.586
- dataset de replay: 4.586 mercados, 166.833 snapshots de odds, 476.342 pontos BTC
- catalogo atual: 21 setups definidos em `src/strategies/setupBacktest/setupCatalog.ts`
- trades simulados: 4.804

Melhores linhas com pelo menos 20 trades:

- `late_momentum_10s_dom_75`: 41 trades, EV/trade 0.0763, ROI 28.8%, PnL 3.13
- `lag_continuation_10s_dom_cheap`: 127 trades, EV/trade 0.0447, ROI 14.1%, PnL 5.68
- `lag_continuation_30s_dom_cheap`: 144 trades, EV/trade 0.0446, ROI 10.1%, PnL 6.42
- `lag_dominance_strong_move`: 74 trades, EV/trade 0.0369, ROI 6.3%, PnL 2.73

Leitura: isso simula os setups candidatos sobre snapshots reais dos logs, mas a serie BTC vem de Binance 1s como proxy e os snapshots de odds sao apenas os pontos observados pelos runners, nao um book historico completo.
