# Early Leader Inversion Paper Results

Generated: 2026-05-25 13:54 BRT

This note documents the crypto Up/Down 5m paper runner focused on Early Leader inversion.

## Setup

The signal watches Polymarket crypto Up/Down 5m markets and:

1. Detects the early leader in the 240s to 181s window before market end.
2. Waits for the opposite side to become the new leader.
3. Enters the new leader when the inversion is strong enough.
4. Exits by take-profit, stop, or near-end condition.

Default paper parameters:

- Stake: `10 USDC`
- Early leader minimum bid: `0.55`
- New leader bid: `0.60` to `0.72`
- Flip gap: `0.03`
- Max entry ask: `0.78`
- Take profit bid: `0.85`
- Stop bid: `0.45`

The enriched runner adds Binance spot context:

- `priceToBeat`: spot price near the start of the 5m window.
- `spotPrice`: current Binance spot price.
- `distanceToBeatUsd`: current distance from price-to-beat in quote currency.
- `distanceToBeatBps`: distance from price-to-beat in bps.
- `directionFromBeat`: `Up`, `Down`, or `Flat` versus price-to-beat.
- `recentMoveBps`: recent spot move over the local sample window.
- `recentVolatilityBps`: standard deviation of recent spot returns in bps.

## Log Files

Logs are local runtime artifacts and are ignored by git through `logs/`.

Relevant local logs:

- `logs/el_inversion_paper_live_20260525_093259.jsonl`
- `logs/el_inversion_enriched_v2_live_20260525_104458.jsonl`
- `logs/el_inversion_sol_xrp_selective_20260525_134939.jsonl` once the focused runner has a loggable event

The `.out.log` and `.err.log` files next to each JSONL contain process output and runtime errors.

## Original Collection

File: `logs/el_inversion_paper_live_20260525_093259.jsonl`

Period captured in the partial report: 2026-05-25 09:37 to 13:54 BRT.

Summary:

| Metric | Value |
| --- | ---: |
| Exits | 69 |
| Wins | 43 |
| Losses | 26 |
| Stake | 527.1715 USDC |
| PnL | +20.7844 USDC |
| ROI | +3.94% |

By market:

| Market | Trades | W/L | PnL | ROI |
| --- | ---: | ---: | ---: | ---: |
| XRP | 13 | 11/2 | +15.6948 | +18.22% |
| SOL | 15 | 11/4 | +13.6831 | +11.78% |
| ETH | 13 | 8/5 | +15.3719 | +14.46% |
| BTC | 13 | 7/6 | -0.3797 | -0.29% |
| DOGE | 10 | 4/6 | -11.5355 | -20.90% |
| BNB | 5 | 2/3 | -12.0503 | -36.04% |

Interpretation:

- XRP and SOL are the best candidates in this partial sample.
- ETH is positive in the broad run but weaker in the enriched run.
- BTC is roughly flat to negative.
- DOGE and BNB are negative and should stay out of the selective strategy for now.

## Enriched V2 Collection

File: `logs/el_inversion_enriched_v2_live_20260525_104458.jsonl`

Period captured in the partial report: 2026-05-25 10:47 to 13:54 BRT.

Summary:

| Metric | Value |
| --- | ---: |
| Exits | 41 |
| Wins | 22 |
| Losses | 19 |
| Stake | 340.7718 USDC |
| PnL | -20.1227 USDC |
| ROI | -5.91% |

By market:

| Market | Trades | W/L | PnL | ROI |
| --- | ---: | ---: | ---: | ---: |
| SOL | 10 | 7/3 | +8.0936 | +10.29% |
| XRP | 7 | 5/2 | +3.2416 | +6.31% |
| ETH | 7 | 3/4 | -7.4866 | -10.70% |
| BTC | 8 | 3/5 | -10.2872 | -12.86% |
| DOGE | 7 | 3/4 | -7.7826 | -18.12% |
| BNB | 2 | 1/1 | -5.9014 | -33.15% |

Interpretation:

- SOL remains positive across both original and enriched samples.
- XRP remains positive across both samples.
- BTC and ETH should not be included in the focused strategy yet, but should remain in broad monitoring for regime checks.

## Filter Mining

The enriched log was used to test filters based on entry context.

Useful partial filters:

| Filter | Trades | W/L | PnL | ROI |
| --- | ---: | ---: | ---: | ---: |
| `secondsToEnd <= 60` | 12 | 10/2 | +18.8934 | +20.30% |
| `abs(distanceToBeatBps) 2-5` | 7 | 6/1 | +13.5768 | +29.40% |
| `recentVolatilityBps 0.5-1.5` | 20 | 12/8 | +5.5771 | +3.58% |
| `secondsToEnd <= 60` and `abs(distanceToBeatBps) 2-5` | 4 | 4/0 | +8.4813 | +36.01% |
| all three filters together | 1 | 1/0 | +2.0000 | +28.57% |

Conclusion:

- Requiring all three filters is too restrictive with the current sample size.
- The strongest candidate is `secondsToEnd <= 60` plus `abs(distanceToBeatBps)` between `2` and `5`.
- The volatility filter is useful as a secondary diagnostic, but should not be mandatory until more samples accumulate.

## Focused Runner

The current focused collection uses:

```powershell
npm.cmd run el-inversion-paper -- --seconds <until-2026-05-26-08:00-BRT> --poll-secs 2 --stake 10 --assets sol,xrp --max-seconds-to-end 60 --min-abs-distance-to-beat-bps 2 --max-abs-distance-to-beat-bps 5 --min-recent-volatility-bps 0.5 --max-recent-volatility-bps 1.5 --log-file logs\el_inversion_sol_xrp_selective_20260525_134939.jsonl
```

The first version is intentionally selective:

- Assets: `SOL,XRP`
- `secondsToEnd <= 60`
- `abs(distanceToBeatBps)` between `2` and `5`
- `recentVolatilityBps` between `0.5` and `1.5`

If sample count is too low, the next balanced version should remove the volatility requirement and keep only:

- Assets: `SOL,XRP`
- `secondsToEnd <= 60`
- `abs(distanceToBeatBps)` between `2` and `5`

## Operational Notes

- Logs are ignored by git and should not be committed directly.
- This remains paper-only. The simulation uses top-of-book quotes and simple size caps, but does not model queue priority, partial fills beyond displayed size, latency, or exchange fees.
- BTC and ETH should remain under broad monitoring but out of the focused paper strategy until they recover in the enriched sample.

## Handoff For Polymarket Bot Tests

The current `polymarket-bot` already has reversal-related code, but it is not the same setup.

Existing reversal behavior in that project:

- `reversal_sniper` and `reversal_scalp` focus on buying the cheap losing side when the current winner is already expensive.
- The thesis is: the apparent winner may fail, so buy the loser cheaply.
- Existing signals include BTC/oracle divergence, winner bid deceleration, loser momentum, and an Early Leader gate.
- Much of the implementation is BTC-specific and uses `BTCUSDT`, Coinbase `BTC-USD`, and `btc-updown-5m-*` assumptions.

The setup documented here is different:

- It does not buy the old loser simply because the leader is expensive.
- It first detects an Early Leader in the 240s to 181s window.
- It then waits for the opposite side to become the new leader.
- It buys the new leader after the inversion, treating the inversion as a directional continuation signal for the new leader.

Copyable implementation request:

```text
Quero testar/adaptar o setup novo de Early Leader Inversion usando a infraestrutura do polymarket-bot.

Contexto:
O bot já tem reversal_sniper e reversal_scalp, mas eles operam outra tese: comprar o lado perdedor barato quando o winner está quase resolvido. Isso performou mal nos logs recentes quando simulado em ETH/SOL/XRP.

O setup novo que quero implementar/testar é diferente:

Nome sugerido:
early_leader_inversion_v1

Mercados:
Crypto Up/Down 5m: inicialmente SOL e XRP. Manter BTC/ETH apenas como benchmark, não como foco inicial.

Definição do Early Leader:
- Janela de detecção: de 240s até 181s antes do fim.
- Calcular o bid médio de UP e DOWN nessa janela.
- O lado com maior bid médio é o early_leader.
- Só considerar se early_leader_bid >= 0.55.

Sinal de inversão:
- Depois da janela de detecção, entre 180s e 60s antes do fim, observar se o lado oposto vira o novo líder.
- new_leader = lado oposto ao early_leader.
- Entrada quando:
  - new_leader_bid >= 0.60
  - new_leader_bid <= 0.72
  - new_leader_bid >= old_leader_bid + 0.03
  - entry ask do new_leader <= 0.78

Tese:
Quando o Early Leader inverte, o novo líder tende a resolver. A entrada é no novo líder, não no loser antigo. Isso é diferente do reversal_sniper clássico.

Saída paper:
- take profit quando bid do lado comprado >= 0.85
- stop quando bid do lado comprado <= 0.45
- sair perto do fim se faltar <= 5s
- registrar PnL por shares: pnl = shares * exitBid - stake

Sizing para simulação mínima:
- comprar 5 cotas
- mas se 5 cotas custarem menos de 1.00 USDC, usar stake mínimo de 1.00 USDC
- stake = max(5 * entryAsk, 1.00)
- shares = stake / entryAsk

Campos extras obrigatórios no log:
- asset
- slug
- observedAt
- secondsToEnd
- earlyLeader
- earlyLeaderBid240
- newLeader
- oldLeaderBid
- newLeaderBid
- entryAsk
- exitBid
- reason
- stake
- shares
- pnl
- priceToBeat
- spotPrice
- distanceToBeatUsd
- distanceToBeatBps
- directionFromBeat
- recentMoveBps
- recentVolatilityBps
- recentDirection

Price-to-beat:
- Para cada mercado 5m, o priceToBeat é o preço spot da Binance no início da janela do slug.
- Exemplo slug: sol-updown-5m-1779732000 => abertura em Unix timestamp 1779732000.
- Usar SOLUSDT, XRPUSDT, ETHUSDT, BTCUSDT conforme asset.

Filtros a testar separadamente, não combinados no primeiro momento:
1. time_only:
   - assets SOL/XRP
   - secondsToEnd <= 60

2. distance_only:
   - assets SOL/XRP
   - abs(distanceToBeatBps) entre 2 e 5

3. volatility_only:
   - assets SOL/XRP
   - recentVolatilityBps entre 0.5 e 1.5

Depois testar combinações:
- time + distance
- time + volatility
- distance + volatility
- time + distance + volatility

Resultados atuais da simulação externa:
Com sizing mínimo de 5 cotas ou 1 USDC:
- Melhor filtro isolado: distance_only, abs(distanceToBeatBps) 2-5
  - 9 trades
  - 8 wins / 1 loss
  - stake 29.50 USDC
  - PnL +8.10 USDC
  - ROI +27.46%

- time_only, secondsToEnd <= 60:
  - 9 trades
  - PnL +5.80
  - ROI +19.97%

- volatility_only, 0.5-1.5 bps:
  - 16 trades
  - PnL +9.70
  - ROI +18.85%

- Melhor combinação encontrada:
  - SOL/XRP + secondsToEnd <= 60 + abs(distanceToBeatBps) 2-5
  - 4 trades
  - 4 wins / 0 losses
  - PnL +5.00
  - ROI +38.17%
  - Amostra pequena, então não usar como único filtro ainda.

Mercados:
- SOL é o mais consistente entre coletas.
- XRP teve melhor resultado bruto em alguns recortes.
- BTC/ETH devem ficar em benchmark por enquanto.
- DOGE/BNB devem ficar fora.

Pedido:
Verifique o estado atual do polymarket-bot e implemente/teste esse early_leader_inversion_v1 aproveitando a infraestrutura existente de logs/paper runners, mas parametrizando asset/symbol para não ficar BTC-hardcoded. Primeiro rodar paper/shadow, sem ordens reais.
```
