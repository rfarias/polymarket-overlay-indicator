# Setup Results - BTC 5m

Generated from: `research-output/setup-backtests/combined-local-btc5-binance-1s/setup-backtest-report.json`
Backtest generated at: 2026-06-05T17:31:48.445Z

## Executive Read

- Setups implemented/tested: 21
- Total simulated trades across all setups: 896
- Data quality: `EXCHANGE_PROXY`; Binance-enriched `priceToBeat`/BTC series, not Chainlink/Data Streams ground truth.
- Current sample size is too small for proof. Treat every positive EV result as a hypothesis.
- Practical evidence thresholds used here: `<100 trades = exploratory`, `100-999 = preliminary`, `1,000-9,999 = stronger`, `10,000+ = robust if stable out of sample`.

## Ranking

| # | Setup | Family | Trades | Evidence | Win rate | Avg entry | EV/trade | ROI | PnL | Max DD | Verdict |
|---:|---|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | distance_dom_neg30_15_mid | distance_dominance | 25 | EXPLORATORY | 72.0% | 0.5020 | +0.2180 | 43.4% | +5.4500 | 0.8200 | positive but under-sampled |
| 2 | late_momentum_30s_dom_80 | late_momentum_continuation | 13 | EXPLORATORY | 69.2% | 0.5300 | +0.1623 | 30.6% | +2.1100 | 0.8500 | positive but under-sampled |
| 3 | lag_continuation_10s_dom_cheap | lag_btc_vs_odds | 33 | EXPLORATORY | 63.6% | 0.4842 | +0.1521 | 31.4% | +5.0200 | 2.4300 | positive but under-sampled |
| 4 | distance_dom_neg15_5_late | distance_dominance | 20 | EXPLORATORY | 90.0% | 0.7625 | +0.1375 | 18.0% | +2.7500 | 0.8500 | positive but under-sampled |
| 5 | late_momentum_10s_dom_75 | late_momentum_continuation | 16 | EXPLORATORY | 56.3% | 0.4275 | +0.1350 | 31.6% | +2.1600 | 0.5700 | positive but under-sampled |
| 6 | crossing_dominance_down_failed_revert | crossing_probability | 14 | EXPLORATORY | 50.0% | 0.3693 | +0.1307 | 35.4% | +1.8300 | 0.8100 | positive but under-sampled |
| 7 | lag_dominance_strong_move | lag_btc_vs_odds | 71 | EXPLORATORY | 71.8% | 0.6065 | +0.1118 | 18.4% | +7.9400 | 4.9600 | positive but under-sampled |
| 8 | near_target_dominance_late_control | near_target_locked | 23 | EXPLORATORY | 65.2% | 0.5522 | +0.1000 | 18.1% | +2.3000 | 1.8300 | positive but under-sampled |
| 9 | distance_dom_neg30_15_late | distance_dominance | 10 | EXPLORATORY | 40.0% | 0.3050 | +0.0950 | 31.1% | +0.9500 | 0.4300 | positive but under-sampled |
| 10 | crossing_dominance_failed_revert | crossing_probability | 7 | EXPLORATORY | 57.1% | 0.5000 | +0.0714 | 14.3% | +0.5000 | 0.6200 | positive but under-sampled |
| 11 | lag_continuation_30s_dom_cheap | lag_btc_vs_odds | 51 | EXPLORATORY | 58.8% | 0.5180 | +0.0702 | 13.6% | +3.5800 | 3.0800 | positive but under-sampled |
| 12 | distance_dom_sigma_180_240 | distance_dominance | 138 | PRELIMINARY | 66.7% | 0.6312 | +0.0354 | 5.6% | +4.8900 | 5.5600 | candidate |
| 13 | near_target_reversal_crossed_late | near_target_locked | 18 | EXPLORATORY | 38.9% | 0.3567 | +0.0322 | 9.0% | +0.5800 | 2.0800 | positive but under-sampled |
| 14 | near_target_reversal_late_sigma05 | near_target_locked | 16 | EXPLORATORY | 37.5% | 0.3613 | +0.0137 | 3.8% | +0.2200 | 1.7500 | positive but under-sampled |
| 15 | distance_rev_near_tie_control | distance_reversal_control | 60 | EXPLORATORY | 41.7% | 0.4070 | +0.0097 | 2.4% | +0.5800 | 3.3800 | positive but under-sampled |
| 16 | late_momentum_reversal_counter | late_momentum_continuation | 81 | EXPLORATORY | 6.2% | 0.0674 | -0.0057 | -8.4% | -0.4600 | 1.3300 | near flat |
| 17 | lag_reversal_30s_countermove | lag_btc_vs_odds | 99 | EXPLORATORY | 13.1% | 0.1615 | -0.0302 | -18.7% | -2.9900 | 4.1800 | reject for now |
| 18 | near_target_reversal_mid_sigma1 | near_target_locked | 71 | EXPLORATORY | 38.0% | 0.4118 | -0.0315 | -7.7% | -2.2400 | 5.4500 | reject for now |
| 19 | crossing_reversal_chop_near | crossing_probability | 57 | EXPLORATORY | 29.8% | 0.3428 | -0.0446 | -13.0% | -2.5400 | 4.9100 | reject for now |
| 20 | distance_rev_pos15_30_control | distance_reversal_control | 32 | EXPLORATORY | 3.1% | 0.0831 | -0.0519 | -62.4% | -1.6600 | 1.6600 | reject for now |
| 21 | crossing_reversal_fresh_cross | crossing_probability | 41 | EXPLORATORY | 31.7% | 0.3937 | -0.0766 | -19.5% | -3.1400 | 7.2800 | reject for now |

## Individual Results

### distance_dom_neg30_15_mid

Family: `distance_dominance`

Rule: Buy dominant side when BTC is 15-30 bps below target with 60-180s remaining.

Result: 25 trades, 72.0% win rate, avg entry 0.5020, EV/trade +0.2180, ROI 43.4%, total PnL +5.4500, max drawdown 0.8200.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### late_momentum_30s_dom_80

Family: `late_momentum_continuation`

Rule: Buy dominant side in final 5-30s on 30s confirming BTC momentum if ask is below 80c.

Result: 13 trades, 69.2% win rate, avg entry 0.5300, EV/trade +0.1623, ROI 30.6%, total PnL +2.1100, max drawdown 0.8500.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### lag_continuation_10s_dom_cheap

Family: `lag_btc_vs_odds`

Rule: Buy dominant side when 10s BTC momentum confirms the dominant side but ask remains below 65c.

Result: 33 trades, 63.6% win rate, avg entry 0.4842, EV/trade +0.1521, ROI 31.4%, total PnL +5.0200, max drawdown 2.4300.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### distance_dom_neg15_5_late

Family: `distance_dominance`

Rule: Buy dominant side when BTC is 5-15 bps below target with 30-60s remaining.

Result: 20 trades, 90.0% win rate, avg entry 0.7625, EV/trade +0.1375, ROI 18.0%, total PnL +2.7500, max drawdown 0.8500.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### late_momentum_10s_dom_75

Family: `late_momentum_continuation`

Rule: Buy dominant side in final 5-30s on 10s confirming BTC momentum if ask is below 75c.

Result: 16 trades, 56.3% win rate, avg entry 0.4275, EV/trade +0.1350, ROI 31.6%, total PnL +2.1600, max drawdown 0.5700.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### crossing_dominance_down_failed_revert

Family: `crossing_probability`

Rule: Buy dominant side when multiple crosses occurred but current distance is -30 to -15 bps.

Result: 14 trades, 50.0% win rate, avg entry 0.3693, EV/trade +0.1307, ROI 35.4%, total PnL +1.8300, max drawdown 0.8100.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### lag_dominance_strong_move

Family: `lag_btc_vs_odds`

Rule: Buy dominant side on stronger 30s BTC move if market still offers below 80c.

Result: 71 trades, 71.8% win rate, avg entry 0.6065, EV/trade +0.1118, ROI 18.4%, total PnL +7.9400, max drawdown 4.9600.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### near_target_dominance_late_control

Family: `near_target_locked`

Rule: Control: buy dominant side late near target only if not priced above 65c.

Result: 23 trades, 65.2% win rate, avg entry 0.5522, EV/trade +0.1000, ROI 18.1%, total PnL +2.3000, max drawdown 1.8300.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### distance_dom_neg30_15_late

Family: `distance_dominance`

Rule: Buy dominant side when BTC is 15-30 bps below target with 15-60s remaining.

Result: 10 trades, 40.0% win rate, avg entry 0.3050, EV/trade +0.0950, ROI 31.1%, total PnL +0.9500, max drawdown 0.4300.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### crossing_dominance_failed_revert

Family: `crossing_probability`

Rule: Buy dominant side when multiple crosses occurred but current distance is already 15-30 bps.

Result: 7 trades, 57.1% win rate, avg entry 0.5000, EV/trade +0.0714, ROI 14.3%, total PnL +0.5000, max drawdown 0.6200.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### lag_continuation_30s_dom_cheap

Family: `lag_btc_vs_odds`

Rule: Buy dominant side when 30s BTC momentum confirms the dominant side but ask remains below 70c.

Result: 51 trades, 58.8% win rate, avg entry 0.5180, EV/trade +0.0702, ROI 13.6%, total PnL +3.5800, max drawdown 3.0800.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### distance_dom_sigma_180_240

Family: `distance_dominance`

Rule: Buy dominant side 180-240s out when distance is 1-5 sigma.

Result: 138 trades, 66.7% win rate, avg entry 0.6312, EV/trade +0.0354, ROI 5.6%, total PnL +4.8900, max drawdown 5.5600.

Evidence: PRELIMINARY. Potentially useful, but still below robust confidence.

Verdict: candidate.

Notes: Candidate for larger-sample validation.

### near_target_reversal_crossed_late

Family: `near_target_locked`

Rule: Buy reversal side near target late only after at least one in-window cross.

Result: 18 trades, 38.9% win rate, avg entry 0.3567, EV/trade +0.0322, ROI 9.0%, total PnL +0.5800, max drawdown 2.0800.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### near_target_reversal_late_sigma05

Family: `near_target_locked`

Rule: Buy reversal side late when BTC is within 5 bps and within 0.5 sigma of target.

Result: 16 trades, 37.5% win rate, avg entry 0.3613, EV/trade +0.0137, ROI 3.8%, total PnL +0.2200, max drawdown 1.7500.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### distance_rev_near_tie_control

Family: `distance_reversal_control`

Rule: Control: buy reversal side close to target with 120-180s remaining.

Result: 60 trades, 41.7% win rate, avg entry 0.4070, EV/trade +0.0097, ROI 2.4%, total PnL +0.5800, max drawdown 3.3800.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: positive but under-sampled.

Notes: Do not treat as proven EV+; prioritize collecting more examples.

### late_momentum_reversal_counter

Family: `late_momentum_continuation`

Rule: Control: buy reversal side in final 5-30s when BTC momentum is counter to current dominant side.

Result: 81 trades, 6.2% win rate, avg entry 0.0674, EV/trade -0.0057, ROI -8.4%, total PnL -0.4600, max drawdown 1.3300.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: near flat.

Notes: Negative after slippage in this sample.

### lag_reversal_30s_countermove

Family: `lag_btc_vs_odds`

Rule: Control: buy reversal side when 30s BTC momentum runs against current dominant side.

Result: 99 trades, 13.1% win rate, avg entry 0.1615, EV/trade -0.0302, ROI -18.7%, total PnL -2.9900, max drawdown 4.1800.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### near_target_reversal_mid_sigma1

Family: `near_target_locked`

Rule: Buy reversal side with 60-180s remaining when BTC is within 5 bps and 1 sigma of target.

Result: 71 trades, 38.0% win rate, avg entry 0.4118, EV/trade -0.0315, ROI -7.7%, total PnL -2.2400, max drawdown 5.4500.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### crossing_reversal_chop_near

Family: `crossing_probability`

Rule: Buy reversal side in choppy near-target regimes with at least 3 crosses in-window.

Result: 57 trades, 29.8% win rate, avg entry 0.3428, EV/trade -0.0446, ROI -13.0%, total PnL -2.5400, max drawdown 4.9100.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### distance_rev_pos15_30_control

Family: `distance_reversal_control`

Rule: Control: buy reversal side when BTC is 15-30 bps above target with 60-120s remaining.

Result: 32 trades, 3.1% win rate, avg entry 0.0831, EV/trade -0.0519, ROI -62.4%, total PnL -1.6600, max drawdown 1.6600.

Evidence: EXPLORATORY. Too few trades for confidence; use only for ranking hypotheses.

Verdict: reject for now.

Notes: Negative after slippage in this sample.

### crossing_reversal_fresh_cross

Family: `crossing_probability`

Rule: Buy reversal side shortly after a recent cross when price remains close to target.

Result: 41 trades, 31.7% win rate, avg entry 0.3937, EV/trade -0.0766, ROI -19.5%, total PnL -3.1400, max drawdown 7.2800.

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
