# Data Sources for Robust BTC 5m Research

Este documento organiza as fontes de dados para montar uma base maior antes de continuar os backtests estatisticos.

Conclusao operacional: o dataset local coletado ate 06h e pequeno demais para validar edge. Ele deve ser usado apenas para validar pipeline. Para inferencia real, priorizar uma base historica com meses de mercados BTC Up/Down 5m, odds historicas, resultado final e, idealmente, book/trades.

## Prioridade 1: Telonex

Uso recomendado: principal candidato para base robusta de Polymarket.

Motivo:

- dados historicos de Polymarket em Parquet
- trades tick-level
- quotes/top-of-book
- snapshots de order book em varios niveis
- onchain fills
- metadata de mercados
- atualizacoes diarias
- tambem oferece dados de Binance em plano pago

Utilidade para este projeto:

- calibracao de odds
- distancia ate Price to Beat
- dominancia falsa
- near-tie
- ultimo minuto
- lag BTC vs odds
- order book imbalance
- simulacao de fill/slippage

Acao recomendada:

1. Usar os datasets gratuitos de markets/tags para descobrir cobertura de mercados BTC 5m.
2. Baixar uma pequena amostra de trades/quotes/book para alguns mercados BTC 5m.
3. Validar schema, timestamps, token ids e resultado final contra Gamma/CLOB.
4. Se a cobertura for boa, usar Telonex como base principal para backtests robustos.

Links:

- https://telonex.io/
- https://telonex.io/docs/schemas/overview

## Prioridade 2: Dune

Uso recomendado: validacao on-chain e base complementar.

Motivo:

- tabelas curadas de prediction markets
- Polymarket `market_trades`
- metadata combinada com API da Polymarket
- bom para volumes, atividade, fills e validacao de settlement/trades

Limite:

- nao substitui historico de order book off-chain
- pode ter atraso de atualizacao
- precisa filtrar bem por `block_time`, `condition_id`, `question` ou slug

Utilidade para este projeto:

- validar trades e volume real
- cruzar fills com sinais
- estudar atividade por mercado
- checar vieses de liquidez
- complementar relatorios de confiabilidade

Links:

- https://docs.dune.com/data-catalog/curated/prediction-markets/overview/

## Prioridade 3: Polymarket APIs oficiais

Uso recomendado: metadata, descoberta de mercados e dados historicos basicos.

Componentes:

- Gamma API: descoberta de mercados, eventos, slugs, outcomes, regras e metadata
- Data API: trades, atividade, holders, open interest e analytics
- CLOB API: order book atual, pricing, midpoints, spreads e price history

Limite:

- `prices-history` pode nao ter granularidade suficiente para 5m/ultimos segundos
- para book historico granular, normalmente sera necessario dataset externo ou coleta propria

Utilidade para este projeto:

- montar universo de mercados BTC Up/Down 5m
- mapear token ids UP/DOWN
- extrair Price to Beat
- validar resultados finais
- enriquecer datasets externos

Links:

- https://docs.polymarket.com/api-reference/introduction

## Prioridade 4: Binance Public Data

Uso recomendado: principal proxy gratuito de preco BTC e microestrutura BTC.

Motivo:

- historico publico de aggTrades, trades e klines
- dados programaticamente baixaveis
- checksums para validacao
- bom volume e granularidade para BTCUSDT

Utilidade para este projeto:

- `price_now`
- retornos 1s/5s/10s/30s/60s
- volatilidade realizada
- z-score
- volume agressor
- velocidade/aceleracao
- proxy para Price to Beat quando Chainlink nao estiver disponivel

Limite:

- nao e necessariamente a fonte oficial de resolucao da Polymarket
- deve ser marcado como proxy

Links:

- https://github.com/binance/binance-public-data
- https://data.binance.vision

## Prioridade 5: Chainlink Data Streams

Uso recomendado: validar fonte de resolucao/oracle quando houver credenciais.

Motivo:

- dados high-frequency e low-latency
- REST API, WebSocket e SDKs
- pode entregar mid price, bid/ask ponderado por liquidez e informacoes de mercado
- mais proximo do tipo de fonte usada em mercados cripto com oracle

Limite:

- exige integracao/credenciais
- precisa confirmar feed e regra especifica de cada mercado

Utilidade para este projeto:

- Chainlink vs Binance/Coinbase
- `oracle_divergence_score`
- resolucao mais fiel
- reduzir erro de fonte nos backtests

Links:

- https://docs.chain.link/data-streams

## Prioridade 6: Tardis.dev

Uso recomendado: fonte profissional para microestrutura BTC, nao para Polymarket.

Motivo:

- tick-level trades
- L2/L3 order books
- snapshots e atualizacoes incrementais
- cobertura ampla de exchanges cripto
- boa opcao para validar microestrutura BTC em alta resolucao

Utilidade para este projeto:

- substituir ou complementar Binance Public Data quando precisar de book BTC real
- validar setups de ultimo minuto
- medir slippage/volatilidade em exchanges
- comparar Binance/Coinbase/Bybit

Limite:

- pago
- nao resolve sozinho o historico de odds/book da Polymarket

Links:

- https://tardis.dev/
- https://docs.tardis.dev/

## Fontes academicas

Uso recomendado: referencia metodologica e possivel dataset, nao depender sem validar cobertura de BTC 5m.

Fontes relevantes:

- Polymarket microstructure paper: arquivo tick-level de order book em painel de mercados
- Polymarket-v1 Database: arquivo on-chain grande de trades e lifecycle

Utilidade:

- metodologia de microestrutura
- limites de inferencia de lado agressor
- validacao de vieses de spread/depth
- possivel comparacao com resultados proprios

Links:

- https://arxiv.org/abs/2604.24366
- https://arxiv.org/abs/2606.04217

## Plano recomendado

1. Parar de tirar conclusoes de edge do dataset de 13 horas.
2. Montar um downloader/importador para Telonex ou, se nao houver acesso, para Dune + Polymarket CLOB + Binance.
3. Criar um formato canonico local:

   - `markets`
   - `odds_snapshots`
   - `orderbook_snapshots`
   - `polymarket_trades`
   - `btc_ticks`
   - `btc_book`
   - `resolutions`

4. Exigir pelo menos algumas semanas de BTC 5m antes de ranquear setups.
5. Usar Dune/Polymarket para validar metadata, token ids, trades e outcomes.
6. Usar Binance Public Data como proxy gratuito inicial de BTC.
7. Adicionar Chainlink quando houver credenciais ou quando a regra do mercado exigir maior fidelidade.

## Decisao pratica

Melhor caminho agora: verificar Telonex primeiro. Se a cobertura de mercados BTC Up/Down 5m for boa, adaptar o projeto para importar Parquet Telonex e continuar os estudos com uma amostra grande. Se Telonex nao cobrir bem ou nao for acessivel, usar Dune + Polymarket APIs + Binance Public Data como alternativa gratuita, aceitando menor qualidade de book historico.
