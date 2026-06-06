# Research Database Plan

O objetivo agora e consolidar dados antes de testar novos setups. A calibracao de odds ja validou que o pipeline funciona, mas nao deve ser usada como conclusao de edge enquanto a base ainda for limitada.

## Estado atual

Base local incorporada:

- 11.345 mercados BTC 5m em `_btc5_markets.parquet`
- 616 mercados resolvidos com orderbook filtrado em `_btc5_ob_filtered.parquet`
- 1.357.121 linhas de book 1s por outcome
- 2.401.077 linhas de prices

Dataset JSON combinado gerado:

- `data/external-btc5/combined-until-20260605-0600.json`

Banco DuckDB consolidado:

- `data/research/btc5_research.duckdb`

Auditoria:

- `research-output/data-audit/btc5_research_audit.json`
- `research-output/data-audit/btc5_research_audit.md`

## Comando

```bash
python scripts/build_btc5_research_db.py \
  --source-dir "C:\Users\Romario\Desktop\BACKUP ROMÁRIO\documentos\polymarket-bot" \
  --output-db data/research/btc5_research.duckdb \
  --audit-output research-output/data-audit/btc5_research_audit.json
```

## Tabelas

`research.btc5_markets`

- metadata dos 11.345 mercados
- inclui resolucao quando disponivel

`research.btc5_markets_resolved`

- subconjunto resolvido diretamente

`research.btc5_orderbook_1s`

- book filtrado/resample 1s por `market_id`, `outcome`, `ts_sec`

`research.btc5_odds_1s`

- odds pivotadas por mercado/segundo
- `up_bid`, `up_ask`, `down_bid`, `down_ask`
- asks inferidos pela complementaridade dos bids
- `seconds_remaining`

`research.btc5_prices`

- prices historicos UP/DOWN do arquivo local

`research.source_manifest`

- paths e papeis dos arquivos origem

## Lacunas antes de novos setups

1. `Price to Beat` nao esta disponivel explicitamente na base local.
2. Falta serie BTC/Chainlink sincronizada para esses mercados historicos.
3. Asks do orderbook local sao inferidos por `1 - bid_oposto`.
4. A base resolvida direta tem 616 mercados, ainda pequena para muitos buckets finos.
5. O arquivo de 11.345 mercados tem muitos pendentes/sem resolucao direta.

## Proximo foco

Antes de construir novos setups:

1. Resolver `Price to Beat` para os mercados historicos:
   - via Gamma/slug/question quando possivel
   - via rules/description se disponivel
   - via fonte externa se existir
   - etapa proxy disponivel: `npm run enrich-btc5-dataset` preenche alvos ausentes com candle Binance mais proximo do inicio da janela e adiciona serie BTC para estudos de distancia marcados como `EXCHANGE_PROXY`

2. Ampliar resolucoes:
   - validar se `resolution=-1` significa pendente real ou falta de parsing
   - inferir resultado por settlement/price final apenas em camada separada e marcada como menor confianca
   - usar Dune/on-chain para validar mercados resolvidos

3. Integrar BTC:
   - Binance Public Data como proxy inicial
   - Chainlink Data Streams quando houver credenciais/fonte confirmada
   - salvar ticks/candles em tabela separada

4. Buscar base Polymarket maior:
   - Telonex primeiro, por cobrir quotes/book/trades historicos
   - Dune para fills e validacao on-chain
   - Polymarket APIs para metadata e token ids

5. So entao retomar:
   - calibracao robusta
   - distance-to-beat
   - crossing probability
   - lag BTC vs odds
   - setups candidatos
