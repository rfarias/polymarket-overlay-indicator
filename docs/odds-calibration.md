# Odds Calibration Study

Estudo de calibracao da odd da Polymarket para mercados BTC Up/Down 5m.

O objetivo e medir se a odd historica estava alinhada com a frequencia real de vitoria de cada lado. O estudo compara:

- odd media disponivel no ask
- win rate real do bucket
- edge bruto = win rate - odd media
- edge liquido = win rate - entrada media apos slippage
- calibration error
- Brier score
- tamanho da amostra

## Comando

```bash
npm run odds-calibration -- --input data/exhaustion-reversal/until-20260605-0600-20260604-170129/dataset.json --output-dir research-output/odds-calibration/until-20260605-0600-20260604-170129
```

Parametros opcionais:

```bash
--min-samples 30
--slippage-price 0.01
--distance-vol-window-sec 60
```

## Saidas

- `odds-calibration-report.json`
- `odds-calibration-buckets.csv`
- `odds-calibration-report.html`

## Buckets

O estudo separa as observacoes por:

- lado: `UP` ou `DOWN`
- faixa de odd
- faixa de segundos restantes
- faixa de distancia em sigma
- combinacoes entre lado, odd, tempo e distancia

Faixas de odd:

- `0.01-0.05`
- `0.05-0.08`
- `0.08-0.10`
- `0.10-0.15`
- `0.15-0.20`
- `0.20-0.30`
- `0.30-0.40`
- `0.40-0.50`
- `0.50-0.60`
- `0.60-0.70`
- `0.70-0.80`
- `0.80-0.90`
- `0.90-0.95`
- `0.95-0.99`

Faixas de tempo restante:

- `180-240`
- `120-180`
- `90-120`
- `60-90`
- `30-60`
- `15-30`
- `5-15`

## Interpretacao

Um bucket so deve ser tratado como candidato se:

- `sampleQuality` for `OK`
- `netEdge` continuar positivo depois do slippage configurado
- o numero de amostras for suficiente para nao depender de poucos eventos
- o resultado fizer sentido em buckets vizinhos
- a qualidade da fonte for compativel com a decisao operacional

## Limitacoes

Este estudo usa o dataset disponivel. Quando o dataset usa Binance ou outra exchange como proxy de preco BTC, a distancia ate o alvo nao deve ser tratada como Chainlink real. A execucao tambem e simplificada: o ask historico e usado como preco de entrada e o desconto de slippage e fixo.
