# Setup Backtest Report

Generated at: 2026-06-08T13:13:59.382Z

## Source Notes

- Backtests candidate setup definitions against the canonical BTC 5m dataset.
- Signals only use BTC and odds snapshots at or before signal/fill time.
- Current default catalog is derived from distance-to-beat stability triage and includes reversal controls.
- Binance-enriched datasets remain EXCHANGE_PROXY and must not be treated as Chainlink/Data Streams ground truth.

## Summary

| Setup | Family | Trades | Win rate | Avg entry | EV/trade | ROI | PnL | Max DD | Quality |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| crossing_dominance_failed_revert | crossing_probability | 2 | 100.0% | 0.700 | 0.3000 | 42.9% | 0.600 | 0.000 | EXCHANGE_PROXY |
| distance_dom_neg30_15_mid | distance_dominance | 2 | 100.0% | 0.780 | 0.2200 | 28.2% | 0.440 | 0.000 | EXCHANGE_PROXY |
| late_momentum_10s_dom_75 | late_momentum_continuation | 41 | 34.1% | 0.265 | 0.0763 | 28.8% | 3.130 | 1.120 | EXCHANGE_PROXY |
| distance_dom_neg15_5_late | distance_dominance | 11 | 81.8% | 0.771 | 0.0473 | 6.1% | 0.520 | 0.700 | EXCHANGE_PROXY |
| lag_continuation_10s_dom_cheap | lag_btc_vs_odds | 127 | 36.2% | 0.317 | 0.0447 | 14.1% | 5.680 | 3.230 | EXCHANGE_PROXY |
| lag_continuation_30s_dom_cheap | lag_btc_vs_odds | 144 | 48.6% | 0.442 | 0.0446 | 10.1% | 6.420 | 3.830 | EXCHANGE_PROXY |
| lag_dominance_strong_move | lag_btc_vs_odds | 74 | 62.2% | 0.585 | 0.0369 | 6.3% | 2.730 | 3.260 | EXCHANGE_PROXY |
| crossing_dominance_down_failed_revert | crossing_probability | 0 | 0.0% | 0.000 | 0.0000 | 0.0% | 0.000 | 0.000 | LOW_CONFIDENCE |
| lag_reversal_30s_countermove | lag_btc_vs_odds | 222 | 15.8% | 0.158 | -0.0002 | -0.1% | -0.040 | 4.580 | EXCHANGE_PROXY |
| near_target_reversal_mid_sigma1 | near_target_locked | 536 | 21.5% | 0.224 | -0.0094 | -4.2% | -5.030 | 9.680 | EXCHANGE_PROXY |
| near_target_reversal_late_sigma05 | near_target_locked | 138 | 8.7% | 0.101 | -0.0137 | -13.6% | -1.890 | 4.040 | EXCHANGE_PROXY |
| distance_rev_pos15_30_control | distance_reversal_control | 305 | 3.6% | 0.052 | -0.0162 | -31.0% | -4.950 | 6.940 | EXCHANGE_PROXY |
| late_momentum_reversal_counter | late_momentum_continuation | 136 | 4.4% | 0.063 | -0.0191 | -30.2% | -2.600 | 2.600 | EXCHANGE_PROXY |
| near_target_reversal_crossed_late | near_target_locked | 197 | 9.6% | 0.116 | -0.0195 | -16.8% | -3.850 | 7.610 | EXCHANGE_PROXY |
| distance_dom_neg30_15_late | distance_dominance | 1 | 0.0% | 0.020 | -0.0200 | -100.0% | -0.020 | 0.020 | EXCHANGE_PROXY |
| distance_rev_near_tie_control | distance_reversal_control | 803 | 26.3% | 0.283 | -0.0201 | -7.1% | -16.110 | 20.570 | EXCHANGE_PROXY |
| distance_dom_sigma_180_240 | distance_dominance | 1163 | 45.5% | 0.476 | -0.0216 | -4.5% | -25.100 | 30.850 | EXCHANGE_PROXY |
| crossing_reversal_fresh_cross | crossing_probability | 383 | 12.5% | 0.147 | -0.0220 | -15.0% | -8.440 | 12.020 | EXCHANGE_PROXY |
| late_momentum_30s_dom_80 | late_momentum_continuation | 18 | 33.3% | 0.357 | -0.0233 | -6.5% | -0.420 | 1.180 | EXCHANGE_PROXY |
| near_target_dominance_late_control | near_target_locked | 250 | 15.6% | 0.181 | -0.0247 | -13.7% | -6.170 | 6.250 | EXCHANGE_PROXY |
| crossing_reversal_chop_near | crossing_probability | 251 | 13.1% | 0.171 | -0.0396 | -23.1% | -9.940 | 10.920 | EXCHANGE_PROXY |

## Period Breakdown

| Period | Setup | Trades | Win rate | Avg entry | EV/trade | PnL |
|---|---|---:|---:|---:|---:|---:|
| 2026-05 | crossing_dominance_failed_revert | 1 | 100.0% | 0.730 | 0.2700 | 0.270 |
| 2026-06 | crossing_dominance_failed_revert | 1 | 100.0% | 0.670 | 0.3300 | 0.330 |
| 2026-04 | crossing_reversal_chop_near | 111 | 22.5% | 0.284 | -0.0584 | -6.480 |
| 2026-05 | crossing_reversal_chop_near | 93 | 5.4% | 0.076 | -0.0219 | -2.040 |
| 2026-06 | crossing_reversal_chop_near | 47 | 6.4% | 0.094 | -0.0302 | -1.420 |
| 2026-04 | crossing_reversal_fresh_cross | 123 | 27.6% | 0.304 | -0.0272 | -3.340 |
| 2026-05 | crossing_reversal_fresh_cross | 181 | 5.0% | 0.071 | -0.0213 | -3.860 |
| 2026-06 | crossing_reversal_fresh_cross | 79 | 6.3% | 0.079 | -0.0157 | -1.240 |
| 2026-04 | distance_dom_neg15_5_late | 10 | 80.0% | 0.764 | 0.0360 | 0.360 |
| 2026-06 | distance_dom_neg15_5_late | 1 | 100.0% | 0.840 | 0.1600 | 0.160 |
| 2026-05 | distance_dom_neg30_15_late | 1 | 0.0% | 0.020 | -0.0200 | -0.020 |
| 2026-04 | distance_dom_neg30_15_mid | 1 | 100.0% | 0.770 | 0.2300 | 0.230 |
| 2026-06 | distance_dom_neg30_15_mid | 1 | 100.0% | 0.790 | 0.2100 | 0.210 |
| 2026-04 | distance_dom_sigma_180_240 | 415 | 59.5% | 0.614 | -0.0189 | -7.840 |
| 2026-05 | distance_dom_sigma_180_240 | 544 | 38.4% | 0.381 | 0.0031 | 1.670 |
| 2026-06 | distance_dom_sigma_180_240 | 204 | 35.8% | 0.451 | -0.0928 | -18.930 |
| 2026-04 | distance_rev_near_tie_control | 428 | 32.7% | 0.344 | -0.0166 | -7.120 |
| 2026-05 | distance_rev_near_tie_control | 248 | 19.0% | 0.214 | -0.0248 | -6.140 |
| 2026-06 | distance_rev_near_tie_control | 127 | 18.9% | 0.211 | -0.0224 | -2.850 |
| 2026-04 | distance_rev_pos15_30_control | 13 | 0.0% | 0.038 | -0.0377 | -0.490 |
| 2026-05 | distance_rev_pos15_30_control | 216 | 3.2% | 0.053 | -0.0210 | -4.530 |
| 2026-06 | distance_rev_pos15_30_control | 76 | 5.3% | 0.052 | 0.0009 | 0.070 |
| 2026-04 | lag_continuation_10s_dom_cheap | 9 | 66.7% | 0.512 | 0.1544 | 1.390 |
| 2026-05 | lag_continuation_10s_dom_cheap | 85 | 38.8% | 0.326 | 0.0620 | 5.270 |
| 2026-06 | lag_continuation_10s_dom_cheap | 33 | 21.2% | 0.242 | -0.0297 | -0.980 |
| 2026-04 | lag_continuation_30s_dom_cheap | 27 | 63.0% | 0.576 | 0.0533 | 1.440 |
| 2026-05 | lag_continuation_30s_dom_cheap | 85 | 50.6% | 0.423 | 0.0827 | 7.030 |
| 2026-06 | lag_continuation_30s_dom_cheap | 32 | 31.3% | 0.377 | -0.0641 | -2.050 |
| 2026-04 | lag_dominance_strong_move | 12 | 75.0% | 0.640 | 0.1100 | 1.320 |
| 2026-05 | lag_dominance_strong_move | 41 | 61.0% | 0.576 | 0.0341 | 1.400 |
| 2026-06 | lag_dominance_strong_move | 21 | 57.1% | 0.571 | 0.0005 | 0.010 |
| 2026-04 | lag_reversal_30s_countermove | 40 | 22.5% | 0.207 | 0.0182 | 0.730 |
| 2026-05 | lag_reversal_30s_countermove | 109 | 14.7% | 0.160 | -0.0131 | -1.430 |
| 2026-06 | lag_reversal_30s_countermove | 73 | 13.7% | 0.128 | 0.0090 | 0.660 |
| 2026-04 | late_momentum_10s_dom_75 | 1 | 0.0% | 0.020 | -0.0200 | -0.020 |
| 2026-05 | late_momentum_10s_dom_75 | 26 | 30.8% | 0.278 | 0.0292 | 0.760 |
| 2026-06 | late_momentum_10s_dom_75 | 14 | 42.9% | 0.258 | 0.1707 | 2.390 |
| 2026-04 | late_momentum_30s_dom_80 | 3 | 66.7% | 0.583 | 0.0833 | 0.250 |
| 2026-05 | late_momentum_30s_dom_80 | 10 | 20.0% | 0.269 | -0.0690 | -0.690 |
| 2026-06 | late_momentum_30s_dom_80 | 5 | 40.0% | 0.396 | 0.0040 | 0.020 |
| 2026-04 | late_momentum_reversal_counter | 27 | 7.4% | 0.103 | -0.0289 | -0.780 |
| 2026-05 | late_momentum_reversal_counter | 65 | 3.1% | 0.051 | -0.0205 | -1.330 |
| 2026-06 | late_momentum_reversal_counter | 44 | 4.5% | 0.057 | -0.0111 | -0.490 |
| 2026-04 | near_target_dominance_late_control | 73 | 39.7% | 0.417 | -0.0197 | -1.440 |
| 2026-05 | near_target_dominance_late_control | 122 | 6.6% | 0.078 | -0.0127 | -1.550 |
| 2026-06 | near_target_dominance_late_control | 55 | 3.6% | 0.094 | -0.0578 | -3.180 |
| 2026-04 | near_target_reversal_crossed_late | 66 | 24.2% | 0.260 | -0.0180 | -1.190 |
| 2026-05 | near_target_reversal_crossed_late | 93 | 0.0% | 0.038 | -0.0376 | -3.500 |
| 2026-06 | near_target_reversal_crossed_late | 38 | 7.9% | 0.057 | 0.0221 | 0.840 |
| 2026-04 | near_target_reversal_late_sigma05 | 40 | 27.5% | 0.254 | 0.0212 | 0.850 |
| 2026-05 | near_target_reversal_late_sigma05 | 72 | 0.0% | 0.036 | -0.0360 | -2.590 |
| 2026-06 | near_target_reversal_late_sigma05 | 26 | 3.8% | 0.044 | -0.0058 | -0.150 |
| 2026-04 | near_target_reversal_mid_sigma1 | 182 | 40.1% | 0.400 | 0.0007 | 0.120 |
| 2026-05 | near_target_reversal_mid_sigma1 | 237 | 12.2% | 0.129 | -0.0071 | -1.690 |
| 2026-06 | near_target_reversal_mid_sigma1 | 117 | 11.1% | 0.141 | -0.0296 | -3.460 |

## Interpretation

- Treat this as setup triage. A positive EV row needs out-of-sample validation and source-quality review.
- Reversal controls are intentionally included to verify that the framework does not only surface positive-looking ideas.
