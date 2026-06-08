# Current Logs Quality Audit

Generated: `2026-06-08T12:50:57.395032+00:00`
Logs DB: `data\research\polymarket_bot_logs.duckdb`
BTC5 DB: `data\research\btc5_research.duckdb`

## Decision

- Status: `pipeline_validation_only`
- Recommendation: Usar esta base para validar pipeline e cobertura; nao concluir edge ainda.
- Blockers:
  - Poucos slugs dos logs cruzam com mercados BTC 5m resolvidos.
  - Poucos eventos fechados cruzam com mercados BTC 5m resolvidos.
  - Muitos eventos sem timestamp normalizavel.

## Summary

- Files: 964 discovered, 956 imported, 8 duplicates
- Events: 882166
- Events with timestamp: 698776
- Events missing timestamp: 183390
- Events with slug: 632770
- Events missing slug: 249396
- Distinct slugs: 6507
- Distinct BTC 5m slugs: 4622
- Closed events: 517
- Time span: 2026-04-24T10:58:29.004571+00:00 to 2026-06-02T16:06:05.516173+00:00

## By Family

- paper: 339494 events, 4295 slugs, 4205 BTC5 slugs, 0 closed, 2026-04-24T10:58:29.004571+00:00 to 2026-06-02T16:05:55.132680+00:00
- multi_coin_observer: 218520 events, 1785 slugs, 0 BTC5 slugs, 0 closed, 2026-05-28T13:40:22.312000+00:00 to 2026-05-30T10:10:03.801000+00:00
- unknown: 187334 events, 1885 slugs, 1785 BTC5 slugs, 0 closed, 2026-04-24T10:58:29.004571+00:00 to 2026-05-30T10:09:48.305446+00:00
- ee_paper: 136754 events, 2785 slugs, 2785 BTC5 slugs, 517 closed, 2026-05-22T10:32:01.562525+00:00 to 2026-06-02T16:06:05.516173+00:00
- el_flip_paper: 64 events, 0 slugs, 0 BTC5 slugs, 0 closed, 2026-05-29T13:27:12.179122+00:00 to 2026-05-30T09:31:17.305630+00:00

## BTC5 Cross

- Log slugs: 6507
- Slugs matched any BTC5 market: 0
- Slugs matched resolved BTC5 market: 0
- Events matched any BTC5 market: 0
- Events matched resolved BTC5 market: 0
- Events inside BTC5 market window: 0
- Closed events matched resolved BTC5: 0

### BTC5 Cross By Family

- paper: 0 resolved slugs, 0 resolved events, 0 events inside window, 0 closed resolved
- multi_coin_observer: 0 resolved slugs, 0 resolved events, 0 events inside window, 0 closed resolved
- unknown: 0 resolved slugs, 0 resolved events, 0 events inside window, 0 closed resolved
- ee_paper: 0 resolved slugs, 0 resolved events, 0 events inside window, 0 closed resolved
- el_flip_paper: 0 resolved slugs, 0 resolved events, 0 events inside window, 0 closed resolved

## Daily Coverage

- 2026-04-24 00:00:00-03: 1752 events, 27 slugs, 0 closed
- 2026-04-25 00:00:00-03: 24800 events, 154 slugs, 0 closed
- 2026-04-26 00:00:00-03: 47252 events, 288 slugs, 0 closed
- 2026-04-27 00:00:00-03: 19420 events, 131 slugs, 0 closed
- 2026-04-28 00:00:00-03: 7096 events, 10 slugs, 0 closed
- 2026-05-11 00:00:00-03: 12946 events, 146 slugs, 0 closed
- 2026-05-12 00:00:00-03: 20264 events, 231 slugs, 0 closed
- 2026-05-13 00:00:00-03: 14568 events, 118 slugs, 0 closed
- 2026-05-14 00:00:00-03: 36880 events, 202 slugs, 0 closed
- 2026-05-15 00:00:00-03: 13714 events, 157 slugs, 0 closed
- 2026-05-18 00:00:00-03: 1607 events, 28 slugs, 0 closed
- 2026-05-20 00:00:00-03: 11877 events, 84 slugs, 0 closed
- 2026-05-21 00:00:00-03: 28222 events, 278 slugs, 0 closed
- 2026-05-22 00:00:00-03: 15229 events, 282 slugs, 36 closed
- 2026-05-23 00:00:00-03: 20039 events, 288 slugs, 86 closed
- 2026-05-24 00:00:00-03: 20872 events, 288 slugs, 85 closed
- 2026-05-25 00:00:00-03: 6183 events, 88 slugs, 24 closed
- 2026-05-26 00:00:00-03: 15329 events, 175 slugs, 59 closed
- 2026-05-27 00:00:00-03: 25615 events, 274 slugs, 92 closed
- 2026-05-28 00:00:00-03: 107974 events, 826 slugs, 40 closed
- 2026-05-29 00:00:00-03: 139980 events, 1258 slugs, 37 closed
- 2026-05-30 00:00:00-03: 48579 events, 540 slugs, 22 closed
- 2026-05-31 00:00:00-03: 25757 events, 288 slugs, 22 closed
- 2026-06-01 00:00:00-03: 18812 events, 212 slugs, 7 closed
- 2026-06-02 00:00:00-03: 14009 events, 158 slugs, 7 closed

## Largest Temporal Gaps

- paper: 334.8h from 2026-04-27T18:35:28.189806+00:00 to 2026-05-11T17:26:23.145358+00:00
- unknown: 309.6h from 2026-04-28T19:52:09.263331+00:00 to 2026-05-11T17:26:23.145358+00:00
- unknown: 186.2h from 2026-05-21T19:15:33.932856+00:00 to 2026-05-29T13:27:50.316008+00:00
- paper: 78.4h from 2026-05-18T10:15:14.227319+00:00 to 2026-05-21T16:36:21.266885+00:00
- unknown: 64.6h from 2026-05-15T17:57:35.931188+00:00 to 2026-05-18T10:33:05.906593+00:00
- paper: 56.8h from 2026-05-16T01:25:54.816625+00:00 to 2026-05-18T10:15:00.246905+00:00
- unknown: 55.5h from 2026-05-18T12:42:23.011903+00:00 to 2026-05-20T20:11:27.814264+00:00
- paper: 27.1h from 2026-05-12T16:14:39.805985+00:00 to 2026-05-13T19:22:20.223824+00:00
- paper: 26.3h from 2026-05-25T10:10:00.895569+00:00 to 2026-05-26T12:25:50.491291+00:00
- ee_paper: 26.3h from 2026-05-25T10:10:40.840345+00:00 to 2026-05-26T12:25:50.323721+00:00