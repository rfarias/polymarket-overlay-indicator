# Distance to Price to Beat Study

Estudo de probabilidade empirica por distancia ate o `Price to Beat` nos mercados BTC Up/Down 5m.

O objetivo e responder perguntas como:

- faltando X segundos, se o BTC esta Y sigmas acima do alvo, qual a chance real de UP vencer?
- o lado dominante vence com frequencia maior que a odd paga?
- o lado de reversao fica barato em alguma faixa de distancia e tempo?

## Comando

```bash
npm run distance-to-beat -- --input data/exhaustion-reversal/until-20260605-0600-20260604-170129/dataset.json --output-dir research-output/distance-to-beat/until-20260605-0600-20260604-170129
```

Parametros opcionais:

```bash
--min-samples 30
--volatility-window-sec 60
--slippage-price 0.01
```

## Saidas

- `distance-to-beat-report.json`
- `distance-to-beat-buckets.csv`
- `distance-to-beat-report.html`

## Estabilidade dos buckets

Depois de gerar o relatorio, rode a triagem de robustez:

```bash
npm run distance-bucket-stability -- \
  --input research-output/distance-to-beat/combined-local-btc5-binance-1s/distance-to-beat-report.json \
  --output-dir research-output/distance-to-beat/combined-local-btc5-binance-1s/stability \
  --min-samples 200 \
  --min-edge 0.02
```

Saidas:

- `distance-bucket-stability.json`
- `distance-bucket-stability.csv`
- `distance-bucket-stability.md`

A classificacao `STABLE` exige suporte em buckets vizinhos na grade de tempo/distancia. `MIXED` e `ISOLATED` devem ser tratados como risco de overfit ate validacao fora da amostra.

## Features

Para cada snapshot de odds, o estudo calcula:

- `secondsRemaining`
- `priceNow`
- `priceToBeat`
- `dominantSide`
- `distanceUsd`
- `distanceBps`
- `distanceSigma`
- `requiredVelocity`
- ask medio de UP, DOWN, dominante e reversao

## Buckets

O relatorio separa por:

- segundos restantes
- distancia em sigma
- distancia assinada em bps
- segundos + distancia sigma
- segundos + distancia assinada bps
- lado dominante + segundos + distancia sigma

## Metricas

- `upWinRate`
- `downWinRate`
- `dominantWinRate`
- `reversalWinRate`
- `dominantNetEdge`
- `reversalNetEdge`
- `avgDistanceBps`
- `avgDistanceSigma`
- `avgRequiredVelocity`
- `sampleQuality`
- `dataQuality`

## Interpretacao

Este estudo nao gera um setup automaticamente. Ele produz uma matriz de probabilidade para comparar a chance real de cada estado contra a odd disponivel.

Um bucket de reversao so deve virar candidato se:

- tiver amostra suficiente
- `reversalNetEdge` for positivo depois de slippage
- o bucket fizer sentido em faixas vizinhas
- a distancia for recuperavel dentro do tempo restante
- a execucao no book for plausivel

Um bucket de dominancia so deve virar candidato se:

- `dominantNetEdge` for positivo
- a probabilidade real superar a odd do lado dominante
- o resultado nao depender apenas de odds muito altas perto de resolucao

## Limitacoes

Quando o dataset usa Binance como proxy, `distanceSigma` e `distanceBps` sao medidas em relacao ao proxy, nao necessariamente a fonte oficial de resolucao da Polymarket. O edge liquido usa slippage fixo e nao modela fill parcial, latencia variavel ou profundidade real do book.
