# Local BTC 5m Parquet Import

Base local encontrada em:

```text
C:\Users\Romario\Desktop\BACKUP ROMÁRIO\documentos\polymarket-bot\
```

Arquivos principais:

- `_btc5_orderbook.parquet`: orderbook bruto tick-level, 3.2 GB
- `_btc5_ob_filtered.parquet`: orderbook filtrado para 616 mercados resolvidos com resample 1s
- `_btc5_prices.parquet`: mid-prices BTC 5m
- `_btc5_markets.parquet`: metadata de 11.345 mercados
- `_btc5_res_map.parquet`: mapa de resolucao dos 616 mercados diretos

## Importador

O script `scripts/import_btc5_parquet.py` converte a base para o formato canonico usado pelos estudos deste projeto:

```bash
python scripts/import_btc5_parquet.py \
  --source-dir "C:\Users\Romario\Desktop\BACKUP ROMÁRIO\documentos\polymarket-bot" \
  --output data/external-btc5/dataset.json
```

Para anexar ao dataset coletado ate 06h:

```bash
python scripts/import_btc5_parquet.py \
  --source-dir "C:\Users\Romario\Desktop\BACKUP ROMÁRIO\documentos\polymarket-bot" \
  --merge-input data/exhaustion-reversal/until-20260605-0600-20260604-170129/dataset.json \
  --output data/external-btc5/combined-until-20260605-0600.json
```

## Como os odds sao derivados

O arquivo filtrado tem `best_bid` por `market_id`, `outcome` e segundo. Para obter odds de entrada:

- `upBid = best_bid` quando `outcome = Up`
- `downBid = best_bid` quando `outcome = Down`
- `upAsk = 1 - downBid`
- `downAsk = 1 - upBid`

Isso assume complementaridade binaria e ignora taxas/ruido de spread residual. Por isso, a fonte fica marcada como `book`, mas o relatorio deve mencionar que asks foram inferidos.

## Limitacao importante

O metadata local nao traz `Price to Beat` explicitamente. O importador define `priceToBeat = 0` apenas para respeitar o schema canonico.

Uso recomendado:

- bom para `odds-calibration`
- bom para estudos de odds, lado, tempo e book
- nao usar diretamente para `distance-to-beat` enquanto nao houver `Price to Beat` e serie BTC sincronizada

## Proximo passo

Rodar `odds-calibration` no dataset combinado e comparar com o dataset pequeno de 13 horas.

Depois de consolidar odds, enriquecer a base grande com proxy BTC/Price to Beat antes de rodar `distance-to-beat`:

```bash
npm run enrich-btc5-dataset -- \
  --input data/external-btc5/combined-until-20260605-0600.json \
  --output data/external-btc5/combined-until-20260605-0600.binance-enriched.json \
  --cache-file data/external-btc5/binance-btcusdt-1s-cache.json \
  --interval 1s
```

Esse enriquecimento usa Binance como proxy e nao substitui Chainlink/Data Streams. Use os resultados como `EXCHANGE_PROXY`.
