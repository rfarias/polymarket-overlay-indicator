# Closed Paper vs Gamma Resolution

Generated: `2026-06-08T13:03:31.961908+00:00`
Logs DB: `data\research\polymarket_bot_logs.duckdb`
Gamma metadata: `research-output\gamma-btc5-metadata\gamma_btc5_closed_metadata.json`

## Overall

- Closed BTC5 events: 517
- Matched Gamma metadata: 517
- Rows with PnL: 278
- Total PnL: 18.48
- Avg PnL: 0.0664748201
- Positive PnL rate: 75.18%
- Explicit WIN outcome rate: 6.58%
- Side win rate vs Gamma: 84.17%

## Setup Summary

- setup:ee_paper: 517 events, totalPnL=18.48, positivePnlRate=75.18%, sideWinRateVsGamma=84.17%
- setup+close_reason:ee_paper|WIN: 34 events, totalPnL=33.54, positivePnlRate=100.00%, sideWinRateVsGamma=94.12%
- setup+close_reason:ee_paper|WIN_HEDGE: 2 events, totalPnL=-6.78, positivePnlRate=0.00%, sideWinRateVsGamma=0.00%
- setup+close_reason:ee_paper|ee_paper_profit_protect: 175 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- setup+close_reason:ee_paper|PROFIT_PROTECT: 175 events, totalPnL=120.0, positivePnlRate=100.00%, sideWinRateVsGamma=94.86%
- setup+close_reason:ee_paper|ee_paper_stop_loss: 64 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- setup+close_reason:ee_paper|STOP_LOSS: 64 events, totalPnL=-113.04, positivePnlRate=0.00%, sideWinRateVsGamma=56.25%
- setup+close_reason:ee_paper|REVERSAL: 3 events, totalPnL=-15.24, positivePnlRate=0.00%, sideWinRateVsGamma=0.00%
- setup+entry_side:ee_paper|DOWN: 133 events, totalPnL=15.06, positivePnlRate=76.69%, sideWinRateVsGamma=84.96%
- setup+entry_side:ee_paper|UP: 145 events, totalPnL=3.42, positivePnlRate=73.79%, sideWinRateVsGamma=83.45%
- setup+entry_side:ee_paper|UNKNOWN: 239 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- setup+entry_price_bucket:ee_paper|0.80-0.82: 49 events, totalPnL=6.96, positivePnlRate=73.47%, sideWinRateVsGamma=79.59%
- setup+entry_price_bucket:ee_paper|0.83-0.84: 126 events, totalPnL=14.94, positivePnlRate=76.98%, sideWinRateVsGamma=84.92%
- setup+entry_price_bucket:ee_paper|0.85-0.86: 103 events, totalPnL=-3.42, positivePnlRate=73.79%, sideWinRateVsGamma=85.44%
- setup+entry_price_bucket:ee_paper|UNKNOWN: 239 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- setup+entry_secs_bucket:ee_paper|120-149: 56 events, totalPnL=4.14, positivePnlRate=78.57%, sideWinRateVsGamma=82.14%
- setup+entry_secs_bucket:ee_paper|090-119: 27 events, totalPnL=2.34, positivePnlRate=77.78%, sideWinRateVsGamma=85.19%
- setup+entry_secs_bucket:ee_paper|150-179: 158 events, totalPnL=-7.56, positivePnlRate=69.62%, sideWinRateVsGamma=83.54%
- setup+entry_secs_bucket:ee_paper|180+: 5 events, totalPnL=3.9, positivePnlRate=100.00%, sideWinRateVsGamma=100.00%
- setup+entry_secs_bucket:ee_paper|UNKNOWN: 239 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- setup+entry_secs_bucket:ee_paper|060-089: 15 events, totalPnL=2.94, positivePnlRate=86.67%, sideWinRateVsGamma=93.33%
- setup+entry_secs_bucket:ee_paper|000-059: 17 events, totalPnL=12.72, positivePnlRate=94.12%, sideWinRateVsGamma=82.35%

## Other Groups

- close_reason:WIN: 34 events, totalPnL=33.54, positivePnlRate=100.00%, sideWinRateVsGamma=94.12%
- close_reason:WIN_HEDGE: 2 events, totalPnL=-6.78, positivePnlRate=0.00%, sideWinRateVsGamma=0.00%
- close_reason:ee_paper_profit_protect: 175 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- close_reason:PROFIT_PROTECT: 175 events, totalPnL=120.0, positivePnlRate=100.00%, sideWinRateVsGamma=94.86%
- close_reason:ee_paper_stop_loss: 64 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- close_reason:STOP_LOSS: 64 events, totalPnL=-113.04, positivePnlRate=0.00%, sideWinRateVsGamma=56.25%
- close_reason:REVERSAL: 3 events, totalPnL=-15.24, positivePnlRate=0.00%, sideWinRateVsGamma=0.00%
- event_type:ee_paper_closed: 278 events, totalPnL=18.48, positivePnlRate=75.18%, sideWinRateVsGamma=84.17%
- event_type:ee_paper_profit_protect: 175 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- event_type:ee_paper_stop_loss: 64 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- entry_side:DOWN: 133 events, totalPnL=15.06, positivePnlRate=76.69%, sideWinRateVsGamma=84.96%
- entry_side:UP: 145 events, totalPnL=3.42, positivePnlRate=73.79%, sideWinRateVsGamma=83.45%
- entry_side:UNKNOWN: 239 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- entry_price_bucket:0.80-0.82: 49 events, totalPnL=6.96, positivePnlRate=73.47%, sideWinRateVsGamma=79.59%
- entry_price_bucket:0.83-0.84: 126 events, totalPnL=14.94, positivePnlRate=76.98%, sideWinRateVsGamma=84.92%
- entry_price_bucket:0.85-0.86: 103 events, totalPnL=-3.42, positivePnlRate=73.79%, sideWinRateVsGamma=85.44%
- entry_price_bucket:UNKNOWN: 239 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- entry_secs_bucket:120-149: 56 events, totalPnL=4.14, positivePnlRate=78.57%, sideWinRateVsGamma=82.14%
- entry_secs_bucket:090-119: 27 events, totalPnL=2.34, positivePnlRate=77.78%, sideWinRateVsGamma=85.19%
- entry_secs_bucket:150-179: 158 events, totalPnL=-7.56, positivePnlRate=69.62%, sideWinRateVsGamma=83.54%
- entry_secs_bucket:180+: 5 events, totalPnL=3.9, positivePnlRate=100.00%, sideWinRateVsGamma=100.00%
- entry_secs_bucket:UNKNOWN: 239 events, totalPnL=None, positivePnlRate=n/a, sideWinRateVsGamma=n/a
- entry_secs_bucket:060-089: 15 events, totalPnL=2.94, positivePnlRate=86.67%, sideWinRateVsGamma=93.33%
- entry_secs_bucket:000-059: 17 events, totalPnL=12.72, positivePnlRate=94.12%, sideWinRateVsGamma=82.35%

## Notes

- Gamma result is inferred from priceToBeat/finalPrice when available.
- This validates closed paper log direction against resolved market metadata; it still does not provide historical book quality for new backtests.