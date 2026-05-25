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
