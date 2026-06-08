# Next PC Handoff: Consolidated Research DB and Setups

Este documento registra onde o trabalho parou neste PC e como prosseguir no outro PC.

Data do estado local: 2026-06-06.

## Resumo executivo

O pipeline de pesquisa esta montado e validado, mas ainda nao ha amostra suficiente para concluir edge real.

Estado atual:

- base BTC 5m consolidada em DuckDB
- importador de logs paper/observer para DuckDB
- datasets BTC 5m enriquecidos com Binance como proxy
- estudos de odds calibration e distance-to-beat
- catalogo inicial de setups
- backtests de setups rodados em base corrigida por slug de janela

Bloqueio atual:

- a base local tem 11.345 mercados BTC 5m, mas so 616 mercados resolvidos com janela/slug/orderbook utilizavel para backtest confiavel
- os resultados atuais validam pipeline, nao validam edge estatistico
- antes de otimizar setup, precisamos consolidar mais historico de logs e mercados resolvidos

## Arquivos principais neste repo

Base DuckDB:

- `data/research/btc5_research.duckdb`
- `data/research/polymarket_bot_logs.duckdb`

Auditorias:

- `research-output/data-audit/btc5_research_audit.md`
- `research-output/data-audit/btc5_research_audit.json`
- `research-output/log-audit/polymarket_bot_logs_audit.md`
- `research-output/log-audit/polymarket_bot_logs_audit.json`

Documentos de contexto:

- `docs/research-database-plan.md`
- `docs/local-btc5-parquet-import.md`
- `docs/polymarket-bot-logs.md`
- `docs/data-sources.md`
- `docs/distance-to-beat.md`
- `docs/odds-calibration.md`
- `docs/setup-backtests.md`

Relatorios de setups:

- `research-output/setup-backtests/local-resolved-slug-window-binance-1s/setup-backtest-report.md`
- `research-output/setup-backtests/local-resolved-slug-window-binance-1s/setup-backtest-summary.csv`
- `research-output/setup-backtests/local-resolved-slug-window-binance-1s/setup-backtest-trades.csv`

Catalogo de setups:

- `src/strategies/setupBacktest/setupCatalog.ts`

CLIs adicionados:

- `src/cli/enrichBtc5Dataset.ts`
- `src/cli/oddsCalibration.ts`
- `src/cli/distanceToBeat.ts`
- `src/cli/distanceBucketStability.ts`
- `src/cli/setupBacktest.ts`
- `src/cli/setupResultsDoc.ts`

Scripts Python:

- `scripts/build_btc5_research_db.py`
- `scripts/import_btc5_parquet.py`
- `scripts/import_polymarket_bot_logs.py`
- `scripts/audit_consolidated_logs.py`
- `scripts/fetch_gamma_btc5_metadata.py`
- `scripts/evaluate_closed_logs_with_gamma.py`
- `scripts/build_setup_dataset_from_logs.py`
- `scripts/compare_setup_backtest_runs.py`

## Estado da base BTC 5m

Banco:

```text
data/research/btc5_research.duckdb
```

Resumo da auditoria:

- Markets total: 11.345
- Markets resolved: 616
- Orderbook rows: 1.357.121
- Orderbook markets: 616
- Odds rows: 647.957
- Odds markets: 616
- Price rows: 2.401.077
- Price markets: 11.345

Origem usada neste PC:

```text
C:\Users\Romario\Desktop\BACKUP ROMARIO\documentos\polymarket-bot
```

Arquivos de origem principais:

- `_btc5_orderbook.parquet`: orderbook bruto tick-level, 3.2 GB
- `_btc5_ob_filtered.parquet`: orderbook filtrado 1s para 616 mercados resolvidos
- `_btc5_prices.parquet`: mid-prices BTC 5m
- `_btc5_markets.parquet`: metadata de 11.345 mercados
- `_btc5_res_map.parquet`: mapa de resolucao dos 616 mercados diretos

Comando usado para montar a base:

```bash
python scripts/build_btc5_research_db.py \
  --source-dir "C:\Users\Romario\Desktop\BACKUP ROMARIO\documentos\polymarket-bot" \
  --output-db data/research/btc5_research.duckdb \
  --audit-output research-output/data-audit/btc5_research_audit.json
```

Observacoes importantes:

- `Price to Beat` nao estava explicito na metadata local.
- Asks em `research.btc5_odds_1s` foram inferidos por complementaridade dos bids.
- A base deve ser tratada como camada de consolidacao, nao como resultado de setup.
- Binance foi usada como proxy para enriquecimento, marcada como `EXCHANGE_PROXY`.

## Estado dos logs paper/observer

Banco:

```text
data/research/polymarket_bot_logs.duckdb
```

Resumo da auditoria:

- Files: 253
- Events: 354.889
- Closed events: 517
- Slugs: 4.570
- Market IDs: 0

Auditoria atualizada apos consolidacao ampliada em 2026-06-08:

- Files discovered: 964
- Files imported: 956
- Duplicate files skipped: 8
- Events imported: 882.166
- Closed events: 517
- Distinct slugs: 6.507
- Distinct BTC 5m slugs nos logs: 4.622
- Slugs que cruzam com `btc5_research.duckdb`: 0

Conclusao: estes logs validam o pipeline e ajudam a mapear cobertura, mas ainda nao cruzam com os 616 mercados BTC 5m resolvidos usados nos backtests confiaveis.

Metadata Gamma para slugs fechados ausentes da base BTC5 local:

- Slugs BTC5 fechados solicitados: 261
- Slugs encontrados na Gamma: 261
- Resultados inferidos: 261
- Com `priceToBeat` e `finalPrice`: 255
- Eventos BTC5 fechados cruzados com Gamma: 517
- Linhas com PnL parseavel: 278
- PnL total paper parseavel: 18.48
- PnL medio: 0.06647
- Taxa de PnL positivo: 75.18%
- Lado escolhido bateu resolucao Gamma: 84.17%

Arquivos:

- `research-output/gamma-btc5-metadata/gamma_btc5_closed_metadata.json`
- `research-output/gamma-btc5-metadata/gamma_btc5_closed_metadata.csv`
- `research-output/gamma-btc5-metadata/closed_paper_vs_gamma_trades.csv`
- `research-output/gamma-btc5-metadata/closed_paper_vs_gamma_summary.md`

Leitura: isso valida os logs fechados contra resultado final, mas ainda nao substitui uma base historica de book/odds para backtest robusto.

Replay do catalogo de setups sobre snapshots dos logs:

- Gamma all metadata: 4.622 slugs solicitados, 4.621 encontrados, 4.586 com `priceToBeat`
- Dataset: `data/external-btc5/log-snapshots-gamma.binance-enriched.json`
- Mercados: 4.586
- Snapshots de odds: 166.833
- Pontos BTC: 476.342
- Catalogo atual: 21 setups em `src/strategies/setupBacktest/setupCatalog.ts`
- Trades simulados: 4.804
- Relatorio: `research-output/setup-backtests/log-snapshots-gamma-binance-1s/setup-backtest-report.md`

Melhores setups com pelo menos 20 trades:

- `late_momentum_10s_dom_75`: 41 trades, win rate 34,1%, EV/trade +0,0763, ROI 28,8%, PnL +3,13
- `lag_continuation_10s_dom_cheap`: 127 trades, win rate 36,2%, EV/trade +0,0447, ROI 14,1%, PnL +5,68
- `lag_continuation_30s_dom_cheap`: 144 trades, win rate 48,6%, EV/trade +0,0446, ROI 10,1%, PnL +6,42
- `lag_dominance_strong_move`: 74 trades, win rate 62,2%, EV/trade +0,0369, ROI 6,3%, PnL +2,73

Observacao: o usuario mencionou 25 setups possiveis, mas o catalogo versionado atual tem 21. Faltam adicionar 4 definicoes ao catalogo se a meta operacional for testar 25.

Comparador preparado para o outro PC:

```bash
python scripts/compare_setup_backtest_runs.py \
  --base-dir research-output/setup-backtests/log-snapshots-gamma-binance-1s \
  --candidate-dir research-output/setup-backtests/OUTRO_PC_RUN \
  --output-dir research-output/setup-backtests/compare-local-vs-other-pc \
  --min-trades 20
```

O comparador marca `survives=true` apenas quando um setup tem amostra minima, EV/trade positivo e PnL positivo nos dois runs.

Familias:

- `ee_paper`: 208 files, 136.347 events, 517 closed
- `el_flip_paper`: 22 files, 22 events, 0 closed
- `multi_coin_observer`: 23 files, 218.520 events, 0 closed

Comando usado:

```bash
python scripts/import_polymarket_bot_logs.py \
  --source-dir "C:\Users\Romario\Desktop\BACKUP ROMARIO\documentos\polymarket-bot" \
  --output-db data/research/polymarket_bot_logs.duckdb \
  --audit-output research-output/log-audit/polymarket_bot_logs_audit.json
```

Padroes de logs relevantes no outro PC:

```text
logs/ee_paper_*/ee_paper.jsonl
logs/el_flip_paper_*/el_flip_paper.jsonl
logs/multi_coin_observer/*
```

Tambem procurar logs em todos os projetos que rodaram runners paper ou reais:

- `*.jsonl`
- `*.log`
- `*.out.log`
- `*.err.log`
- `paper*`
- `runner*`
- `observer*`
- `monitor*`
- `trade*`
- `fills*`
- `orders*`

## Estado dos setups

Backtest corrigido principal:

```text
research-output/setup-backtests/local-resolved-slug-window-binance-1s/setup-backtest-report.md
```

Dataset usado:

```text
data/external-btc5/local-resolved-slug-window.binance-enriched.json
```

Comando usado:

```bash
npm run setup-backtest -- \
  --input data/external-btc5/local-resolved-slug-window.binance-enriched.json \
  --output-dir research-output/setup-backtests/local-resolved-slug-window-binance-1s
```

Resultado pratico:

- 2.877 trades simulados somando todos os setups
- nenhum setup chegou a 1.000 trades
- melhor setup com mais de 100 trades: `lag_continuation_10s_dom_cheap`
  - 111 trades
  - win rate 63,1%
  - EV/trade +0,0766
  - ROI 13,8%
- outro candidato: `lag_continuation_30s_dom_cheap`
  - 123 trades
  - win rate 61,0%
  - EV/trade +0,0433
- setup com mais amostra: `distance_dom_sigma_180_240`
  - 511 trades
  - win rate 64,0%
  - EV/trade +0,0011, quase flat

Leitura:

- continuar tratando como triagem
- nao otimizar filtros ainda
- aumentar base historica primeiro
- depois rodar novamente os 21 setups

## Estrategia para consolidar logs entre PCs sem inflar o Git

Objetivo:

- manter os logs fisicamente dentro da pasta do repositorio para facilitar scripts e reproducibilidade
- evitar commitar gigabytes de JSON/log bruto
- commitar somente scripts, docs, manifests, auditorias e talvez resumos agregados

Estrutura recomendada:

```text
data/
  raw-logs/
    pc-romario-desktop/
      polymarket-bot/
        logs-jsonl-gz/
        logs-manifest.csv
        logs-manifest.json
    other-pc/
      project-name/
        logs-jsonl-gz/
        logs-manifest.csv
        logs-manifest.json
  research/
    consolidated_logs.duckdb
    btc5_research.duckdb
  external-btc5/
  collected-logs/
research-output/
  log-audit/
  data-audit/
  setup-backtests/
```

Recomendacao de Git:

- deixar `data/raw-logs/`, `data/collected-logs/`, `data/research/*.duckdb`, `*.log`, `*.jsonl`, `*.jsonl.gz` fora do Git normal
- commitar apenas:
  - scripts de importacao
  - manifests pequenos
  - auditorias `.md` e `.json`
  - relatorios resumidos `.md` e `.csv`
  - documentos em `docs/`

Se for necessario versionar arquivos grandes:

- preferir DVC, git-annex ou Git LFS
- para este projeto, a opcao mais simples agora e manter os brutos ignorados pelo Git e versionar apenas manifests/auditorias

Formato recomendado para logs compactados:

- preservar extensao logica no nome
- compactar arquivo por arquivo, nao um zip unico gigante
- exemplo:

```text
ee_paper.jsonl -> ee_paper.jsonl.gz
runner_stdout_20260521.log -> runner_stdout_20260521.log.gz
```

Vantagens:

- cada arquivo continua auditavel
- importador pode ler streaming
- evita recompactar tudo quando entra log novo
- facilita deduplicacao por hash

Campos minimos do manifest:

```text
source_pc
source_project
source_path
repo_relative_path
family
file_name
extension
compressed
size_bytes_raw
size_bytes_compressed
sha256_raw
sha256_compressed
first_timestamp
last_timestamp
event_count
created_at
imported_at
```

Deduplicacao:

- usar `sha256_raw` como chave principal
- se dois arquivos tiverem o mesmo hash bruto, importar uma vez
- se nomes forem diferentes mas hash igual, registrar aliases no manifest

## Plano para prosseguir no outro PC

1. Fazer pull deste repo e abrir este documento.
2. Copiar ou manter os logs locais do outro PC dentro de `data/raw-logs/other-pc/...`, sem commitar bruto.
3. Compactar `*.jsonl` e `*.log` para `*.gz`, preservando um manifest por projeto.
4. Rodar `scripts/import_polymarket_bot_logs.py` com um ou mais `--source-dir`.
5. Gerar um novo banco unificado:

```bash
python scripts/import_polymarket_bot_logs.py \
  --source-dir "CAMINHO_DO_PROJETO_1" \
  --source-dir "CAMINHO_DO_PROJETO_2" \
  --output-db data/research/consolidated_logs.duckdb \
  --audit-output research-output/log-audit/consolidated_logs_audit.json
```

6. Revisar o manifest gerado em `research-output/log-audit/consolidated_logs_manifest.csv` e confirmar duplicatas por `sha256_raw`.
7. Criar tabelas canonicas:

```text
research.log_files
research.raw_events
research.paper_events
research.paper_closed_events
research.real_order_events
research.real_fill_events
research.runner_sessions
research.source_manifest
```

8. Cruzar logs com mercados BTC 5m:

```text
slug
condition_id
token_id
market_id
question
start_ts
end_ts
asset
strategy_name
runner_name
paper_or_real
```

9. Regerar auditorias e resumos.
10. So depois voltar para:

- ampliar mercados resolvidos
- enriquecer Price to Beat/oracle
- rerodar distance-to-beat
- rerodar setup-backtest
- comparar setups por periodo e por fonte de dados

## Mudancas de codigo provavelmente necessarias

Importador de logs:

- aceitar multiplos diretorios de origem: feito
- aceitar logs `.gz`: feito
- gerar manifest por arquivo: feito
- deduplicar por `sha256_raw`: feito
- inferir familia de estrategia pelo caminho e pelo payload
- preservar `payload_json`
- criar tabelas separadas para paper e real: estrutura inicial feita

Banco:

- criar `consolidated_logs.duckdb`
- manter `btc5_research.duckdb` separado no inicio
- depois, se fizer sentido, criar um banco unico `research_consolidated.duckdb`

Gitignore sugerido:

```gitignore
data/raw-logs/
data/collected-logs/
data/research/*.duckdb
data/research/*.duckdb-*
*.jsonl
*.jsonl.gz
*.log
*.log.gz
```

Nao aplicar essa mudanca sem revisar, porque hoje alguns arquivos JSON de dataset em `data/external-btc5/` sao uteis para reproducibilidade local.

## Proxima decisao tecnica

A decisao mais importante no outro PC e escolher a politica de armazenamento:

Opcao A, recomendada agora:

- brutos compactados ficam dentro da pasta do repo, mas ignorados pelo Git
- DuckDBs ficam ignorados
- manifests/auditorias/docs ficam commitados

Opcao B:

- usar DVC/git-annex para versionar brutos grandes
- melhor para reproducibilidade entre maquinas
- mais setup operacional

Opcao C:

- usar Git LFS
- simples, mas pode ficar caro/pesado se os logs crescerem muito

Para o momento, seguir com Opcao A.
