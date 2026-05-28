# Early Leader Inversion - metodologia de pesquisa

Atualizado em 2026-05-28.

Este documento descreve o setup atual de pesquisa para mercados crypto Up/Down 5m da Polymarket. O objetivo e servir como material de transferencia para testes no `polymarket-bot`, mantendo a separacao entre tese, metodologia, parametros, logs e limitacoes.

O setup e apenas paper/shadow. Ele nao executa ordens reais.

## Tese

O mercado Up/Down 5m frequentemente escolhe um lado dominante cedo. O setup observa esse "early leader" e procura uma inversao posterior: se o lado oposto vira o novo lider perto do fim, o paper compra o novo lider, nao o antigo perdedor barato.

Em outras palavras:

- Primeiro identifica quem liderava entre 240s e 181s antes do fim.
- Depois espera o lado oposto virar lider.
- A entrada e no novo lider depois da inversao.
- A tese e continuidade do novo lider apos a virada, nao mean reversion do lado perdedor.

Isso difere de um `reversal_sniper` classico. Aqui a compra nao e "o loser esta barato"; a compra e "o loser virou winner e a estrutura do book confirmou a inversao".

## Universo

Mercados-alvo:

- `SOL` e `XRP` sao o universo paper principal atual.
- `BTC` e `ETH` ficam em `observe-only` para benchmark e comparacao de regime.
- `DOGE` e `BNB` ficaram fora do preset atual por desempenho historico pior nas amostras iniciais.

Formato esperado do slug:

```text
sol-updown-5m-1779975600
xrp-updown-5m-1779975600
btc-updown-5m-1779975600
eth-updown-5m-1779975600
```

O timestamp Unix no slug representa o inicio da janela de 5 minutos. O fim teorico e `timestamp + 300s`.

## Pipeline atual

O runner `src/cli/earlyLeaderInversionPaper.ts` chama `EarlyLeaderInversionPaperService` e executa este fluxo:

1. Monta os slugs Up/Down 5m atuais para os assets configurados.
2. Busca mercados na Gamma API da Polymarket.
3. Busca quotes top-of-book na CLOB API para os tokens Up e Down.
4. Mantem amostras locais de bids por mercado.
5. Calcula o early leader usando a janela de 240s a 181s antes do fim.
6. Calcula contexto Binance spot e price-to-beat.
7. Avalia se houve inversao conforme filtros.
8. Em modo paper, abre uma posicao simulada.
9. Em modo observe-only, registra `SIGNAL` sem abrir trade.
10. Fecha posicoes por take profit, stop ou proximidade do fim.
11. Grava tudo em JSONL local.

Os mercados sao atualizados a cada 30s. As quotes sao consultadas no intervalo configurado por `--poll-secs`.

## Definicao do early leader

Para cada mercado, o runner guarda amostras com:

- `secondsToEnd`
- `upBid`
- `downBid`

A janela de deteccao e:

```text
240s >= secondsToEnd >= 181s
```

Dentro dessa janela:

- calcula a media de `upBid`
- calcula a media de `downBid`
- o maior bid medio define `elLeader`
- `elBid240` e o bid medio do lider
- exige `elBid240 >= minEarlyLeaderBid`

Padrao atual:

```text
minEarlyLeaderBid = 0.55
```

## Sinal de inversao

Depois que o contexto esta pronto, o lado oposto ao early leader vira `newLeader`.

Exemplo:

- early leader: `Down`
- new leader esperado: `Up`

A inversao so e aceita quando:

```text
newLeaderBid >= minNewLeaderBid
newLeaderBid <= maxNewLeaderBid
newLeaderBid >= oldLeaderBid + minFlipGap
entryAsk <= maxEntryAsk
minSecondsToEnd <= secondsToEnd <= maxSecondsToEnd
```

Preset atual recomendado:

```text
minNewLeaderBid = 0.60
maxNewLeaderBid = 0.72
minFlipGap = 0.03
maxEntryAsk = 0.65
minSecondsToEnd = 15
maxSecondsToEnd = 60
```

O limite `maxEntryAsk=0.65` e mais conservador do que a versao inicial (`0.78`). A ideia e evitar pagar caro demais por sinais que ja podem estar resolvidos no book.

## Entrada paper

No modo paper, o runner usa stake fixa solicitada e limita o preenchimento pelo tamanho visivel no melhor ask:

```text
requestedStake = options.stake
tradeStake = min(requestedStake, entryAsk * entryBestAskSize)
shares = tradeStake / entryAsk
fillRatio = tradeStake / requestedStake
```

Padrao do preset atual:

```text
stake = 5 USDC
```

Se nao houver liquidez no melhor ask (`entryBestAskSize`) ou se o stake preenchivel for zero, a entrada e ignorada.

Limitacao importante: isso modela apenas top-of-book. Nao modela fila, latencia real, derrapagem, cancelamento de ordem, varias camadas do book ou taxas.

## Saida paper

Uma posicao aberta e monitorada pelo bid do outcome comprado.

Sai quando qualquer condicao abaixo ocorre:

```text
exitBid >= takeProfitBid
exitBid <= stopBid
secondsToEnd <= exitSecondsToEnd
```

Preset atual:

```text
takeProfitBid = 0.85
stopBid = 0.55
exitSecondsToEnd = 5
```

PnL paper:

```text
pnl = shares * exitBid - stake
```

O runner tambem registra excursao durante o trade:

- melhor bid visto
- pior bid visto
- maior PnL visto
- menor PnL visto
- timestamps desses extremos

## Contexto Binance spot

O runner enriquece cada observacao com dados Binance.

Para cada asset, usa:

```text
BTCUSDT
ETHUSDT
SOLUSDT
XRPUSDT
DOGEUSDT
BNBUSDT
```

Campos principais:

- `priceToBeat`: preco spot mais proximo do inicio da janela 5m.
- `spotPrice`: preco spot atual.
- `distanceToBeatUsd`: diferenca entre spot atual e price-to-beat.
- `distanceToBeatBps`: distancia em bps contra price-to-beat.
- `directionFromBeat`: `Up`, `Down` ou `Flat`.
- `recentMoveBps`: movimento em bps na janela recente de 60s.
- `recentVolatilityBps`: desvio padrao dos retornos recentes em bps.
- `recentDirection`: direcao do spot na janela recente.

Campos adicionais atuais:

- movimentos spot em 10s, 30s, 60s e 120s
- volatilidade spot em 10s, 30s, 60s e 120s
- numero de cruzamentos do price-to-beat em 60s e 120s
- segundos desde ultimo cruzamento do price-to-beat
- estabilidade da direcao contra price-to-beat
- candle atual de 1m e 5m: corpo, range, volume e posicao do fechamento
- movimentos BTC/ETH de 60s e 300s como contexto macro
- spread relativo do asset contra BTC e ETH

Esses campos nao sao todos filtros obrigatorios. Eles existem para pesquisa posterior de regime.

## Filtros de pesquisa

Os filtros principais devem ser testados separadamente antes de combinar:

1. Time window:

```text
assets = SOL,XRP
15s <= secondsToEnd <= 60s
```

2. Distance to beat:

```text
abs(distanceToBeatBps) entre 2 e 5
```

3. Volatility:

```text
recentVolatilityBps entre 0.5 e 1.5
```

Combinacoes a testar:

- time only
- distance only
- volatility only
- time + distance
- time + volatility
- distance + volatility
- time + distance + volatility

O preset atual operacional usa time window e os thresholds de book, mas nao forca distancia/volatilidade por padrao. Os campos sao logados para mineracao posterior.

## Modos de execucao

Paper principal SOL/XRP:

```bash
npm run el-inversion-sol-xrp
```

Equivalente ao preset:

```bash
tsx src/cli/earlyLeaderInversionPaper.ts --poll-secs 0.5 --stake 5 --assets sol,xrp --min-seconds-to-end 15 --max-seconds-to-end 60 --max-entry-ask 0.65 --stop-bid 0.55
```

Observe-only BTC/ETH:

```bash
npm run el-inversion-observe-btc-eth
```

Equivalente ao preset:

```bash
tsx src/cli/earlyLeaderInversionPaper.ts --observe-only --poll-secs 0.5 --stake 0 --assets btc,eth --min-seconds-to-end 15 --max-seconds-to-end 60 --max-entry-ask 0.65 --stop-bid 0.55
```

Analisador de logs:

```bash
npm run el-inversion-analyze -- --logs logs/arquivo.jsonl --stakes 1,5,10
```

O analisador resume:

- total de linhas por log
- `SKIP`, `SIGNAL`, `ENTRY`, `EXIT`
- motivos de skip
- sinais em observe-only
- simulacao de exits com diferentes stakes quando ha trades fechados

## Tipos de evento no JSONL

`SKIP`:

- Mercado observado, mas sem entrada.
- Pode ser por `no_inversion`, `fetch failed`, distancia fora do filtro, volatilidade fora do filtro ou outro motivo.

`SIGNAL`:

- Sinal valido em `observe-only`.
- Nao abre paper trade.
- Usado para benchmark de assets fora do paper principal.

`ENTRY`:

- Entrada paper aberta.
- Registra entry ask, liquidez, spread, stake preenchido, shares e contexto.

`EXIT`:

- Saida paper fechada.
- Registra exit bid, PnL, motivo de saida e contexto de entrada/saida.

## Campos minimos para portar ao polymarket-bot

Para implementar no `polymarket-bot`, manter pelo menos estes campos:

```text
type
observedAt
marketId
slug
asset
outcome
secondsToEnd
entrySecondsToEnd
exitSecondsToEnd
elLeader
elBid240
newLeader
oldLeaderBid
newLeaderBid
flipGap
entryAsk
entryBestAskSize
entryBestBid
entrySpread
entryTopLiquidity
requestedStake
stake
fillRatio
shares
exitBid
reason
pnl
priceToBeat
spotPrice
distanceToBeatUsd
distanceToBeatBps
directionFromBeat
recentMoveBps
recentVolatilityBps
recentDirection
```

Campos recomendados para pesquisa de regime:

```text
newLeaderStableSeconds
newLeaderBidMove5s
newLeaderBidMove10s
oldLeaderBidMove5s
oldLeaderBidMove10s
flipGapMove5s
flipGapMove10s
spotMoveBps10s
spotMoveBps30s
spotMoveBps60s
spotMoveBps120s
spotVolatilityBps10s
spotVolatilityBps30s
spotVolatilityBps60s
spotVolatilityBps120s
beatCrosses60s
beatCrosses120s
secondsSinceBeatCross
directionStableSeconds
candle1mBodyBps
candle1mRangeBps
candle1mVolume
candle1mClosePosition
candle5mBodyBps
candle5mRangeBps
candle5mVolume
candle5mClosePosition
btcMoveBps60s
btcMoveBps300s
ethMoveBps60s
ethMoveBps300s
assetVsBtcMoveBps60s
assetVsEthMoveBps60s
```

## Resultados historicos relevantes

Amostras antigas, ainda pequenas, indicaram:

- SOL e XRP foram os melhores candidatos iniciais.
- ETH foi positivo em algumas rodadas, mas menos estavel.
- BTC ficou perto de flat/negativo.
- DOGE e BNB performaram pior.

Na coleta original de 2026-05-25:

- 69 exits
- 43 wins / 26 losses
- PnL aproximado: `+20.78 USDC`
- ROI aproximado: `+3.94%`

Por asset nessa amostra:

- XRP: `+18.22% ROI`
- SOL: `+11.78% ROI`
- ETH: `+14.46% ROI`
- BTC: `-0.29% ROI`
- DOGE: `-20.90% ROI`
- BNB: `-36.04% ROI`

Na coleta enriquecida v2 de 2026-05-25:

- 41 exits
- 22 wins / 19 losses
- PnL aproximado: `-20.12 USDC`
- ROI aproximado: `-5.91%`

Por asset nessa amostra:

- SOL: `+10.29% ROI`
- XRP: `+6.31% ROI`
- ETH: `-10.70% ROI`
- BTC: `-12.86% ROI`
- DOGE: `-18.12% ROI`
- BNB: `-33.15% ROI`

Interpretacao de pesquisa:

- SOL manteve consistencia melhor entre as duas coletas.
- XRP tambem ficou positivo nas duas.
- BTC/ETH nao devem ser foco do preset principal sem nova evidencia.
- O resultado ainda nao e conclusivo por tamanho de amostra, vies de horario e mudancas de regime.

## Estado observado em 2026-05-28

Processos ativos retomados apos travamento:

- `el-inversion-sol-xrp` rodando por 24h em paper.
- `el-inversion-observe-btc-eth` rodando por 24h em observe-only.

Logs ativos:

```text
logs/el_inversion_sol_xrp_recommended_20260528_095822.jsonl
logs/el_inversion_btc_eth_observe_20260528_095822.jsonl
```

Resumo parcial no momento da retomada:

- SOL/XRP: 81 linhas, 0 entries, 0 exits, principal motivo `no_inversion`.
- BTC/ETH observe: 49 linhas, 1 signal ETH, 0 exits, principal motivo `no_inversion`.

Isso nao invalida o setup. Apenas mostra que o preset atual esta seletivo e pode ficar varios ciclos sem entrada.

## Metodologia de pesquisa recomendada

1. Rodar paper e observe-only por blocos longos, idealmente varios periodos de mercado.
2. Separar logs por data, preset, assets e parametros.
3. Nunca misturar resultados de presets diferentes sem etiquetar.
4. Avaliar primeiro:
   - numero de sinais
   - taxa de entrada
   - taxa de fechamento por take profit, stop e near-end
   - ROI por asset
   - ROI por faixa de `secondsToEnd`
   - ROI por faixa de `entryAsk`
   - ROI por `distanceToBeatBps`
   - ROI por `recentVolatilityBps`
5. Validar se o resultado sobrevive a:
   - stake menor e maior
   - liquidez real no melhor ask
   - horarios diferentes
   - dias diferentes
   - assets diferentes
6. So depois transformar filtro em regra operacional.

## Hipoteses abertas

Hipoteses a testar com os campos novos:

- Sinais com `newLeaderStableSeconds` maior performam melhor.
- Aceleracao positiva do `newLeaderBidMove5s` melhora entrada.
- `flipGapMove5s` positivo evita inversoes falsas.
- Distancia muito grande do price-to-beat ja pode estar precificada e piorar ROI.
- Regime macro de BTC/ETH afeta SOL/XRP, mesmo em mercados especificos.
- Candles 1m/5m com fechamento perto da maxima/minima filtram direcao melhor que `recentMoveBps`.
- Muitos cruzamentos do price-to-beat indicam chop e pioram o setup.

## Regras para portar ao polymarket-bot

Nome sugerido:

```text
early_leader_inversion_v1
```

Requisitos de implementacao:

- Parametrizar assets e simbolos; nao deixar BTC hardcoded.
- Separar modo `paper`, `observe` e futura execucao real.
- Manter log JSONL completo antes de qualquer trade real.
- Usar slugs 5m para extrair start/end do mercado.
- Calcular early leader por media de bid na janela 240s-181s.
- Comprar somente o novo lider apos inversao confirmada.
- Modelar stake com limite por liquidez visivel.
- Registrar sinais rejeitados com motivo.
- Permitir replay/analise por arquivo.

Regra minima para primeiro teste no bot:

```text
assets = SOL,XRP
minEarlyLeaderBid = 0.55
minNewLeaderBid = 0.60
maxNewLeaderBid = 0.72
minFlipGap = 0.03
maxEntryAsk = 0.65
minSecondsToEnd = 15
maxSecondsToEnd = 60
takeProfitBid = 0.85
stopBid = 0.55
exitSecondsToEnd = 5
paperStake = 5 USDC
```

BTC/ETH:

```text
observeOnly = true
```

## Limitacoes

- A coleta e online; sem replay tick-by-tick completo do order book.
- Top-of-book pode superestimar fills.
- Nao ha modelagem de prioridade de fila.
- Nao ha execucao real nem cancelamento.
- Binance spot pode divergir da fonte de resolucao efetiva do mercado.
- Resultados historicos sao amostras pequenas.
- Mudancas de regime podem inverter o desempenho por asset.
- Logs locais em `logs/` nao sao versionados pelo git.

## Criterio para evoluir

Antes de considerar qualquer execucao real:

- Amostra maior por asset.
- Resultado positivo fora do periodo original de mineracao.
- Estabilidade em diferentes stakes simulados.
- Queda aceitavel ao aplicar limite de liquidez.
- Simulador com ordem, cancelamento, latencia e slippage.
- Travas de risco: perda diaria, max trades, max exposicao por asset, kill switch e dry-run obrigatorio.
