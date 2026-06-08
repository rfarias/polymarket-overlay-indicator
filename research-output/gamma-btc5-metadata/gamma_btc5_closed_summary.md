# Gamma BTC5 Metadata Fetch

Generated: `2026-06-08T12:55:58.739667+00:00`
Logs DB: `data\research\polymarket_bot_logs.duckdb`
BTC5 DB: `data\research\btc5_research.duckdb`
Closed only: `True`

## Summary

- Requested slugs: 261
- Fetched rows: 261
- Errors: 0
- Gamma found: 261
- Resolved result inferred: 261
- With priceToBeat: 255
- Window start min: 2026-05-22T10:35:00+00:00
- Window start max: 2026-06-02T11:25:00+00:00

## Notes

- Results are inferred from Gamma eventMetadata finalPrice/priceToBeat when available, otherwise final outcome prices.
- This fetch adds metadata/resolution only; it does not add historical Polymarket book/odds snapshots.