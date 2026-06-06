# Setup Backtests

Camada comum para transformar buckets de pesquisa em setups candidatos testaveis.

O objetivo nao e assumir que um setup funciona. O fluxo e:

1. construir base canonica com mercados, odds, BTC proxy/oracle e `priceToBeat`
2. gerar estudos de probabilidade, como `distance-to-beat`
3. filtrar buckets por estabilidade
4. transformar somente candidatos plausiveis em setups parametrizados
5. comparar EV, win rate, drawdown, ROI e qualidade de dados

## Comando

```bash
npm run setup-backtest -- \
  --input data/external-btc5/combined-until-20260605-0600.binance-enriched.json \
  --output-dir research-output/setup-backtests/combined-local-btc5-binance-1s
```

## Saidas

- `setup-backtest-report.json`
- `setup-backtest-summary.csv`
- `setup-backtest-trades.csv`
- `setup-backtest-report.md`

## Catalogo inicial

O catalogo inicial esta em `src/strategies/setupBacktest/setupCatalog.ts`.

Inclui:

- `distance_dominance`: compra o lado dominante em faixas de distancia/tempo que sobreviveram melhor a triagem de estabilidade
- `distance_reversal_control`: controles negativos de reversao para verificar se a tese de reversao barata realmente aparece ou nao
- `crossing_probability`: testa cruzamentos do `Price to Beat`, incluindo regimes de chop perto do alvo e falhas de reversao
- `near_target_locked`: testa mercado perto do alvo, com distancia pequena em bps/sigma, para verificar se o lado oposto ao dominante fica barato demais
- `lag_btc_vs_odds`: testa momentum recente do BTC contra odds ainda relativamente baratas, como proxy de lag entre BTC e Polymarket
- `late_momentum_continuation`: testa continuidade nos segundos finais, separada do lag/momentum mais amplo

## Resultado inicial em `combined-local-btc5-binance-1s`

> Nota: os primeiros resultados serviram apenas como validacao de pipeline. Depois foi corrigida a importacao da janela de mercado para usar o timestamp do slug `btc-updown-5m-{unix_start}`. A baseline atual deve usar `local-resolved-slug-window-binance-1s`.

Comando executado:

```bash
npm run setup-backtest -- \
  --input data/external-btc5/local-resolved-slug-window.binance-enriched.json \
  --output-dir research-output/setup-backtests/local-resolved-slug-window-binance-1s
```

Leitura objetiva:

- A base corrigida gerou 2.877 trades simulados somando todos os setups, mas nenhum setup chegou a 1.000 trades.
- O melhor setup com amostra acima de 100 trades foi `lag_continuation_10s_dom_cheap`: 111 trades, WR 63.1%, EV/trade +0.0766.
- `distance_dom_sigma_180_240` teve 511 trades, mas EV/trade ficou quase flat: +0.0011.
- Reversao/chop continua fraca em varios controles, principalmente `crossing_reversal_*`, `distance_rev_near_tie_control` e `late_momentum_reversal_counter`.
- Alguns setups positivos ainda têm amostra muito baixa e devem ser ignorados para conclusao estatistica.

## Tamanho de amostra

Classificacao operacional:

- `<100 trades`: somente hipotese exploratoria.
- `100-999 trades`: preliminar, ainda sem robustez.
- `1.000-9.999 trades`: comeca a ter peso se houver estabilidade por periodo.
- `10.000+ trades`: robusto apenas se tambem passar em slippage, fill, latencia e fonte oficial/proxy.

A base local corrigida ainda nao e suficiente para afirmar EV+ real. O objetivo agora e aumentar a base historica antes de otimizar filtros.

## Bloqueio atual para escala

A base local tem 11.345 linhas de mercado, mas apenas 616 mercados resolvidos com slug BTC 5m utilizavel. Os 10.729 pendentes nao trazem slug de janela, entao nao devem ser usados para backtest de `priceToBeat` sem outra fonte de metadata/resolucao.

Proxima frente de dados:

- buscar mais mercados resolvidos via Gamma/CLOB historico ou fonte externa
- validar Telonex/Tardis/Dune para preencher mercados sem slug/resolucao
- manter coleta live para acumular book/odds de alta granularidade
- so depois rodar novamente os 21 setups e iniciar otimizacao para reduzir perdas sem matar wins

## Limitacoes

- O dataset Binance-enriched e `EXCHANGE_PROXY`, nao fonte oficial Chainlink/Data Streams.
- O modelo usa ask historico e slippage fixo.
- Ainda nao modela fill parcial real, latencia variavel, profundidade completa do book ou divergencia oracle/exchange.
- Resultado positivo precisa ser validado fora da amostra antes de virar paper/live setup.
