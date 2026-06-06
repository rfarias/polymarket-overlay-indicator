# Setup Results - BTC 5m

Generated from: `research-output/setup-backtests/combined-local-btc5-binance-1s/setup-backtest-report.json`
Backtest generated at: 2026-06-05T17:57:32.311Z

## Executive Read

- Setups implemented/tested: 21
- Total simulated trades across all setups: 2877
- Data quality: `EXCHANGE_PROXY`; Binance-enriched `priceToBeat`/BTC series, not Chainlink/Data Streams ground truth.
- Current sample size is too small for proof. Treat every positive EV result as a hypothesis.
- Practical evidence thresholds used here: `<100 trades = exploratory`, `100-999 = preliminary`, `1,000-9,999 = stronger`, `10,000+ = robust if stable out of sample`.

## Ranking

| # | Setup | Family | Trades | Evidence | Win rate | Avg entry | EV/trade | ROI | PnL | Max DD | Verdict |
|---:|---|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | crossing_dominance_failed_revert | crossing_probability | 2 | EXPLORATORY | 100.0% | 0.6500 | +0.3500 | 53.8% | +0.7000 | 0.0000 | positive but under-sampled |
| 2 | distance_dom_neg30_15_late | distance_dominance | 1 | EXPLORATORY | 100.0% | 0.6600 | +0.3400 | 51.5% | +0.3400 | 0.0000 | positive but under-sampled |
| 3 | crossing_dominance_down_failed_revert | crossing_probability | 2 | EXPLORATORY | 100.0% | 0.7100 | +0.2900 | 40.8% | +0.5800 | 0.0000 | positive but under-sampled |
| 4 | lag_continuation_10s_dom_cheap | lag_btc_vs_odds | 111 | PRELIMINARY | 63.1% | 0.5541 | +0.0766 | 13.8% | +8.5000 | 2.5100 | candidate |
| 5 | distance_dom_neg15_5_late | distance_dominance | 52 | EXPLORATORY | 86.5% | 0.8183 | +0.0471 | 5.8% | +2.4500 | 2.3700 | positive but under-sampled |
| 6 | near_target_reversal_late_sigma05 | near_target_locked | 103 | PRELIMINARY | 43.7% | 0.3903 | +0.0466 | 11.9% | +4.8010 | 2.5800 | candidate |
| 7 | lag_continuation_30s_dom_cheap | lag_btc_vs_odds | 123 | PRELIMINARY | 61.0% | 0.5664 | +0.0433 | 7.7% | +5.3300 | 4.7900 | candidate |
| 8 | lag_reversal_30s_countermove | lag_btc_vs_odds | 219 | PRELIMINARY | 21.0% | 0.1957 | +0.0143 | 7.3% | +3.1350 | 6.5600 | weak positive |
| 9 | near_target_reversal_crossed_late | near_target_locked | 123 | PRELIMINARY | 39.0% | 0.3795 | +0.0107 | 2.8% | +1.3200 | 6.3500 | weak positive |
| 10 | distance_rev_pos15_30_control | distance_reversal_control | 68 | EXPLORATORY | 7.4% | 0.0650 | +0.0085 | 13.1% | +0.5800 | 2.0100 | positive but under-sampled |
| 11 | distance_dom_sigma_180_240 | distance_dominance | 511 | PRELIMINARY | 64.0% | 0.6388 | +0.0011 | 0.2% | +0.5700 | 8.2900 | weak positive |
| 12 | lag_dominance_strong_move | lag_btc_vs_odds | 90 | EXPLORATORY | 61.1% | 0.6169 | -0.0058 | -0.9% | -0.5200 | 6.4100 | near flat |
| 13 | late_momentum_10s_dom_75 | late_momentum_continuation | 40 | EXPLORATORY | 60.0% | 0.6175 | -0.0175 | -2.8% | -0.7000 | 2.6300 | reject for now |
| 14 | near_target_reversal_mid_sigma1 | near_target_locked | 283 | PRELIMINARY | 41.3% | 0.4334 | -0.0200 | -4.6% | -5.6500 | 12.1500 | reject for now |
| 15 | distance_rev_near_tie_control | distance_reversal_control | 392 | PRELIMINARY | 34.2% | 0.3712 | -0.0293 | -7.9% | -11.5000 | 17.1500 | reject for now |
| 16 | crossing_reversal_chop_near | crossing_probability | 241 | PRELIMINARY | 30.7% | 0.3371 | -0.0300 | -8.9% | -7.2300 | 10.0100 | reject for now |
| 17 | late_momentum_reversal_counter | late_momentum_continuation | 177 | PRELIMINARY | 7.3% | 0.1108 | -0.0373 | -33.7% | -6.6040 | 7.3740 | reject for now |
| 18 | crossing_reversal_fresh_cross | crossing_probability | 179 | PRELIMINARY | 35.8% | 0.3980 | -0.0405 | -10.2% | -7.2500 | 12.9400 | reject for now |
| 19 | near_target_dominance_late_control | near_target_locked | 135 | PRELIMINARY | 47.4% | 0.5455 | -0.0714 | -13.1% | -9.6400 | 16.8800 | reject for now |
| 20 | late_momentum_30s_dom_80 | late_momentum_continuation | 20 | EXPLORATORY | 55.0% | 0.6355 | -0.0855 | -13.5% | -1.7100 | 3.3500 | reject for now |
| 21 | distance_dom_neg30_15_mid | distance_dominance | 5 | EXPLORATORY | 60.0% | 0.7280 | -0.1280 | -17.6% | -0.6400 | 1.4900 | reject for now |

## Individual Results

### crossing_dominance_failed_revert

Family: `crossing_probability`

Rule: Buy dominant side when multiple crosses occurred but current distance is already 15-30 bps.

Result: 2 trades, 100.0% win rate, avg entry 0.6500, EV/trade +0.3500, ROI 53.8%, total PnL +0.7000, max drawdown 0.0000.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### distance_dom_neg30_15_late

Family: `distance_dominance`

Rule: Buy dominant side when BTC is 15-30 bps below target with 15-60s remaining.

Result: 1 trades, 100.0% win rate, avg entry 0.6600, EV/trade +0.3400, ROI 51.5%, total PnL +0.3400, max drawdown 0.0000.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### crossing_dominance_down_failed_revert

Family: `crossing_probability`

Rule: Buy dominant side when multiple crosses occurred but current distance is -30 to -15 bps.

Result: 2 trades, 100.0% win rate, avg entry 0.7100, EV/trade +0.2900, ROI 40.8%, total PnL +0.5800, max drawdown 0.0000.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### lag_continuation_10s_dom_cheap

Family: `lag_btc_vs_odds`

Rule: Buy dominant side when 10s BTC momentum confirms the dominant side but ask remains below 65c.

Result: 111 trades, 63.1% win rate, avg entry 0.5541, EV/trade +0.0766, ROI 13.8%, total PnL +8.5000, max drawdown 2.5100.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: candidate.

Notes: Candidate for larger-sample validation.

### distance_dom_neg15_5_late

Family: `distance_dominance`

Rule: Buy dominant side when BTC is 5-15 bps below target with 30-60s remaining.

Result: 52 trades, 86.5% win rate, avg entry 0.8183, EV/trade +0.0471, ROI 5.8%, total PnL +2.4500, max drawdown 2.3700.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### near_target_reversal_late_sigma05

Family: `near_target_locked`

Rule: Buy reversal side late when BTC is within 5 bps and within 0.5 sigma of target.

Result: 103 trades, 43.7% win rate, avg entry 0.3903, EV/trade +0.0466, ROI 11.9%, total PnL +4.8010, max drawdown 2.5800.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: candidate.

Notes: Candidate for larger-sample validation.

### lag_continuation_30s_dom_cheap

Family: `lag_btc_vs_odds`

Rule: Buy dominant side when 30s BTC momentum confirms the dominant side but ask remains below 70c.

Result: 123 trades, 61.0% win rate, avg entry 0.5664, EV/trade +0.0433, ROI 7.7%, total PnL +5.3300, max drawdown 4.7900.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: candidate.

Notes: Candidate for larger-sample validation.

### lag_reversal_30s_countermove

Family: `lag_btc_vs_odds`

Rule: Control: buy reversal side when 30s BTC momentum runs against current dominant side.

Result: 219 trades, 21.0% win rate, avg entry 0.1957, EV/trade +0.0143, ROI 7.3%, total PnL +3.1350, max drawdown 6.5600.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: weak positive.

Notes: Candidate for larger-sample validation.

### near_target_reversal_crossed_late

Family: `near_target_locked`

Rule: Buy reversal side near target late only after at least one in-window cross.

Result: 123 trades, 39.0% win rate, avg entry 0.3795, EV/trade +0.0107, ROI 2.8%, total PnL +1.3200, max drawdown 6.3500.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: weak positive.

Notes: Candidate for larger-sample validation.

### distance_rev_pos15_30_control

Family: `distance_reversal_control`

Rule: Control: buy reversal side when BTC is 15-30 bps above target with 60-120s remaining.

Result: 68 trades, 7.4% win rate, avg entry 0.0650, EV/trade +0.0085, ROI 13.1%, total PnL +0.5800, max drawdown 2.0100.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### distance_dom_sigma_180_240

Family: `distance_dominance`

Rule: Buy dominant side 180-240s out when distance is 1-5 sigma.

Result: 511 trades, 64.0% win rate, avg entry 0.6388, EV/trade +0.0011, ROI 0.2%, total PnL +0.5700, max drawdown 8.2900.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: weak positive.

Notes: Candidate for larger-sample validation.

### lag_dominance_strong_move

Family: `lag_btc_vs_odds`

Rule: Buy dominant side on stronger 30s BTC move if market still offers below 80c.

Result: 90 trades, 61.1% win rate, avg entry 0.6169, EV/trade -0.0058, ROI -0.9%, total PnL -0.5200, max drawdown 6.4100.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: near flat.

Notes: Negative after slippage in this sample.

### late_momentum_10s_dom_75

Family: `late_momentum_continuation`

Rule: Buy dominant side in final 5-30s on 10s confirming BTC momentum if ask is below 75c.

Result: 40 trades, 60.0% win rate, avg entry 0.6175, EV/trade -0.0175, ROI -2.8%, total PnL -0.7000, max drawdown 2.6300.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### near_target_reversal_mid_sigma1

Family: `near_target_locked`

Rule: Buy reversal side with 60-180s remaining when BTC is within 5 bps and 1 sigma of target.

Result: 283 trades, 41.3% win rate, avg entry 0.4334, EV/trade -0.0200, ROI -4.6%, total PnL -5.6500, max drawdown 12.1500.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### distance_rev_near_tie_control

Family: `distance_reversal_control`

Rule: Control: buy reversal side close to target with 120-180s remaining.

Result: 392 trades, 34.2% win rate, avg entry 0.3712, EV/trade -0.0293, ROI -7.9%, total PnL -11.5000, max drawdown 17.1500.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### crossing_reversal_chop_near

Family: `crossing_probability`

Rule: Buy reversal side in choppy near-target regimes with at least 3 crosses in-window.

Result: 241 trades, 30.7% win rate, avg entry 0.3371, EV/trade -0.0300, ROI -8.9%, total PnL -7.2300, max drawdown 10.0100.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### late_momentum_reversal_counter

Family: `late_momentum_continuation`

Rule: Control: buy reversal side in final 5-30s when BTC momentum is counter to current dominant side.

Result: 177 trades, 7.3% win rate, avg entry 0.1108, EV/trade -0.0373, ROI -33.7%, total PnL -6.6040, max drawdown 7.3740.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### crossing_reversal_fresh_cross

Family: `crossing_probability`

Rule: Buy reversal side shortly after a recent cross when price remains close to target.

Result: 179 trades, 35.8% win rate, avg entry 0.3980, EV/trade -0.0405, ROI -10.2%, total PnL -7.2500, max drawdown 12.9400.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### near_target_dominance_late_control

Family: `near_target_locked`

Rule: Control: buy dominant side late near target only if not priced above 65c.

Result: 135 trades, 47.4% win rate, avg entry 0.5455, EV/trade -0.0714, ROI -13.1%, total PnL -9.6400, max drawdown 16.8800.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### late_momentum_30s_dom_80

Family: `late_momentum_continuation`

Rule: Buy dominant side in final 5-30s on 30s confirming BTC momentum if ask is below 80c.

Result: 20 trades, 55.0% win rate, avg entry 0.6355, EV/trade -0.0855, ROI -13.5%, total PnL -1.7100, max drawdown 3.3500.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### distance_dom_neg30_15_mid

Family: `distance_dominance`

Rule: Buy dominant side when BTC is 15-30 bps below target with 60-180s remaining.

Result: 5 trades, 60.0% win rate, avg entry 0.7280, EV/trade -0.1280, ROI -17.6%, total PnL -0.6400, max drawdown 1.4900.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

## What This Means

- The current base is useful to reject weak ideas and rank hypotheses.
- It is not enough to claim a production edge.
- Dominance/continuation setups are consistently better than reversal setups in this sample.
- Reversal setups are mostly negative or weak after slippage.
- The next priority is more data, then out-of-sample validation and walk-forward splits.

## Required Sample Sizes

- 100 trades: minimum sanity check; still very noisy.
- 1,000 trades: useful early confidence if EV persists across periods.
- 10,000 trades: closer to robust, provided source quality, fills, latency and slippage are modeled realistically.

## Missing From The Claimed 25

The current executable setup catalog contains 21 implemented setups. If the intended list is 25, 4 setups are still not formalized in `src/strategies/setupBacktest/setupCatalog.ts`, so there is no honest result to report for them yet.

Next implementation should either add the 4 missing definitions explicitly or generate the remaining variants from a parameter grid and mark them as exploratory.
