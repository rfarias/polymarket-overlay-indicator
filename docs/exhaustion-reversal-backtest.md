# Exhaustion Reversal Backtest

Modulo de pesquisa para testar reversoes estatisticas nos mercados BTC Up/Down 5m.

O objetivo e validar, com dados historicos, se comprar o lado barato de reversao apos uma esticada extrema do BTC gera EV positivo depois de custos. O modulo nao executa trade real.

## Comando

```bash
npm run exhaustion-reversal-backtest -- --input data/exhaustion-dataset.json
```

Para rodar a grade ampla de parametros:

```bash
npm run exhaustion-reversal-backtest -- --input data/exhaustion-dataset.json --grid
```

Saidas:

- `research-output/exhaustion-reversal/exhaustion-reversal-report.json`
- `research-output/exhaustion-reversal/exhaustion-reversal-trades.csv`
- `research-output/exhaustion-reversal/exhaustion-reversal-report.html`

## Formato do Dataset

```json
{
  "markets": [
    {
      "marketId": "123",
      "slug": "btc-updown-5m-1770000000",
      "startTimeMs": 1770000000000,
      "endTimeMs": 1770000300000,
      "priceToBeat": 100000,
      "result": "UP",
      "upTokenId": "up-token",
      "downTokenId": "down-token"
    }
  ],
  "btcPrices": [
    {
      "timeMs": 1770000240000,
      "price": 100160,
      "volume": 12.3,
      "buyVolume": 9.1,
      "sellVolume": 3.2,
      "source": "binance"
    }
  ],
  "odds": [
    {
      "marketId": "123",
      "timeMs": 1770000240000,
      "upBid": 0.86,
      "upAsk": 0.88,
      "downBid": 0.11,
      "downAsk": 0.12,
      "downAskSize": 250,
      "downTopLiquidity": 400,
      "source": "book"
    }
  ]
}
```

## Cuidados

- `priceToBeat` deve ser o preco de resolucao da janela. Preferir Chainlink quando disponivel.
- `btcPrices` pode usar Binance/Coinbase como proxy, mas o relatorio marca a qualidade dos dados.
- `odds` deve ser historico real de ask/bid por token para medir EV com confianca.
- Se odds vierem de `prices-history` ou trade, o resultado deve ser tratado como menos confiavel que book historico.
- O simulador usa apenas amostras com timestamp menor ou igual ao sinal para indicadores.
- A entrada simula latencia e slippage via parametros.
