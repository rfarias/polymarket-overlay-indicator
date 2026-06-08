# Log Snapshot Setup Replay

Data local: 2026-06-08.

Este documento registra o metodo usado para simular o catalogo de setups sobre os snapshots dos logs locais e como continuar no outro PC com logs adicionais.

## Objetivo

Comparar os setups candidatos contra snapshots reais observados pelos runners, em vez de avaliar somente os trades paper que efetivamente abriram.

O fluxo usa:

- logs consolidados em DuckDB
- metadata/resolucao da Gamma API por slug BTC5
- snapshots de odds presentes nos logs
- Binance BTCUSDT 1s como proxy de serie BTC
- catalogo atual em `src/strategies/setupBacktest/setupCatalog.ts`

## Scripts

- `scripts/import_polymarket_bot_logs.py`: importa logs, cria manifest e deduplica por `sha256_raw`.
- `scripts/audit_consolidated_logs.py`: audita cobertura temporal e cruzamento com BTC5.
- `scripts/fetch_gamma_btc5_metadata.py`: busca metadata/resolucao Gamma para slugs BTC5 dos logs.
- `scripts/evaluate_closed_logs_with_gamma.py`: valida eventos paper fechados contra resolucao Gamma.
- `scripts/build_setup_dataset_from_logs.py`: converte snapshots dos logs para dataset canonico de setup backtest.

## Comandos

Importar logs:

```bash
python scripts/import_polymarket_bot_logs.py \
  --source-dir "CAMINHO_DO_PROJETO_COM_LOGS" \
  --output-db data/research/consolidated_logs.duckdb \
  --audit-output research-output/log-audit/consolidated_logs_audit.json
```

Auditar cobertura:

```bash
python scripts/audit_consolidated_logs.py \
  --logs-db data/research/consolidated_logs.duckdb \
  --btc5-db data/research/btc5_research.duckdb \
  --output research-output/log-audit/current_logs_quality.json
```

Buscar metadata Gamma:

```bash
python scripts/fetch_gamma_btc5_metadata.py \
  --logs-db data/research/consolidated_logs.duckdb \
  --btc5-db data/research/btc5_research.duckdb \
  --output-dir research-output/gamma-btc5-metadata \
  --workers 12
```

Gerar dataset de replay:

```bash
python scripts/build_setup_dataset_from_logs.py \
  --logs-db data/research/consolidated_logs.duckdb \
  --gamma-metadata research-output/gamma-btc5-metadata/gamma_btc5_all_metadata.json \
  --output data/external-btc5/log-snapshots-gamma.dataset.json
```

Enriquecer com Binance 1s:

```bash
npm run enrich-btc5-dataset -- \
  --input data/external-btc5/log-snapshots-gamma.dataset.json \
  --output data/external-btc5/log-snapshots-gamma.binance-enriched.json \
  --cache-file data/external-btc5/binance-btcusdt-1s-cache.json \
  --interval 1s
```

Rodar setups:

```bash
npm run setup-backtest -- \
  --input data/external-btc5/log-snapshots-gamma.binance-enriched.json \
  --output-dir research-output/setup-backtests/log-snapshots-gamma-binance-1s
```

## Resultado Local

Base de replay:

- Slugs BTC5 solicitados na Gamma: 4.622
- Slugs encontrados: 4.621
- Mercados com `priceToBeat` utilizavel: 4.586
- Snapshots de odds: 166.833
- Pontos BTC apos Binance 1s: 476.342
- Setups no catalogo atual: 21
- Trades simulados: 4.804

Melhores setups com pelo menos 20 trades:

| Setup | Trades | Win rate | EV/trade | ROI | PnL | Max DD |
|---|---:|---:|---:|---:|---:|---:|
| `late_momentum_10s_dom_75` | 41 | 34.1% | +0.0763 | 28.8% | +3.13 | 1.12 |
| `lag_continuation_10s_dom_cheap` | 127 | 36.2% | +0.0447 | 14.1% | +5.68 | 3.23 |
| `lag_continuation_30s_dom_cheap` | 144 | 48.6% | +0.0446 | 10.1% | +6.42 | 3.83 |
| `lag_dominance_strong_move` | 74 | 62.2% | +0.0369 | 6.3% | +2.73 | 3.26 |

Controles/reversal ficaram majoritariamente negativos, o que e util para validar que o framework nao esta apenas encontrando sinais positivos por construcao.

## Gates Candidatos Para Lapidar

Estes filtros foram avaliados em cima dos trades simulados. Tratar como candidatos para variantes, nao como conclusao final.

### `lag_continuation_30s_dom_cheap`

Mudanca simples:

- reduzir `maxEntryAsk` de `0.70` para `0.60`

Resultado filtrado:

- 102 trades
- EV/trade +0.0688
- PnL +7.02
- Max DD 2.39

Leitura: melhora PnL total e reduz drawdown. E o ajuste mais defensavel.

### `lag_continuation_10s_dom_cheap`

Mudanca simples:

- exigir `entryAsk >= 0.05`
- reduzir `maxEntryAsk` de `0.65` para `0.60`

Resultado filtrado:

- 97 trades
- EV/trade +0.0663
- PnL +6.43
- Max DD 2.52

Leitura: corta entradas baratissimas ruins e entradas caras demais.

### `lag_dominance_strong_move`

Variante sugerida:

- trocar janela de `30-180s` para `90-150s`

Resultado filtrado:

- 28 trades
- EV/trade +0.1893
- PnL +5.30
- Max DD 1.25

Leitura: forte, mas com amostra menor. Criar como variante.

### `late_momentum_10s_dom_75`

Variante sugerida:

- exigir `distanceBps` entre `5` e `8`
- exigir `momentumBps` entre `2` e `5`

Resultado filtrado:

- 15 trades
- EV/trade +0.2587
- PnL +3.88
- Max DD 0.36

Leitura: muito seletivo. Bom candidato para observacao, ainda com pouca amostra.

## Proximo Passo No Outro PC

1. Importar logs adicionais para um `consolidated_logs.duckdb`.
2. Repetir o replay completo.
3. Comparar os quatro gates candidatos com a base ampliada.
4. Se a meta operacional for 25 setups, adicionar quatro variantes ao `setupCatalog.ts`:
   - `lag_continuation_30s_dom_cheap_tight_60`
   - `lag_continuation_10s_dom_cheap_entry_05_60`
   - `lag_dominance_strong_move_90_150`
   - `late_momentum_10s_dom_75_dist5_8_mom2_5`

## Limites

- Binance 1s e proxy, nao fonte oficial Chainlink/Data Streams.
- Os snapshots de odds sao apenas os pontos observados pelos runners, nao book historico completo.
- Resultados positivos precisam sobreviver aos logs do outro PC e a validacao fora da amostra.
