# polymarket-overlay-indicator

Projeto local e independente para leitura agressiva da **direção provável das odds** em mercados BTC da Polymarket.

> ✅ Sem integração com `polymarket-bot`.
> ✅ Sem automação de ordens.
> ✅ Foco total em backend + overlay funcional em tempo real.

## Arquitetura

- **Backend Node.js local** (`src/server`)
  - Conecta no WS Market da Polymarket (`wss://ws-subscriptions-clob.polymarket.com/ws/market`)
  - Conecta no WS RTDS da Polymarket (`wss://ws-live-data.polymarket.com`)
  - Detecta mercado BTC ativo (ou usa `MARKET_IDS` explícito)
  - Calcula `Aggressive Edge Score`
  - Exponibiliza estado em `GET /api/edge`
  - Faz log NDJSON em `logs/edge-signals.ndjson`

- **Overlay Tampermonkey** (`src/overlay/overlay.js`)
  - Painel flutuante na Polymarket (arrastável)
  - Atualização contínua via API local
  - Exibição de score, direção, confiança, entrada/saída, reversão

## Estrutura

```text
polymarket-overlay-indicator/
  package.json
  .env.example
  README.md
  /src
    /feeds
      polymarketMarketWs.js
      polymarketRtdsWs.js
      activeMarketResolver.js
    /engine
      aggressiveScore.js
      momentum.js
      bookImbalance.js
      tradePressure.js
      reversalRisk.js
      targetDistance.js
      latencyDelta.js
    /server
      index.js
      state.js
    /overlay
      overlay.js
      overlay.css
```

## Score agressivo

```text
Aggressive Edge Score =
  35% Divergência preço x odd
+ 25% Momentum curto
+ 20% Book imbalance
+ 10% Trade pressure
+ 10% Tempo restante
```

Proteções implementadas:
- bloqueio por spread alto
- penalidade por book fino
- risco de late entry
- risco de reversão

Faixas:
- `0–39`: sem trade
- `40–59`: formação
- `60–74`: leve
- `75–84`: forte
- `85+`: agressivo máximo

## Setup local

1. Instale dependências:

```bash
npm install
```

2. Configure ambiente:

```bash
cp .env.example .env
```

3. Rode o backend:

```bash
npm run start
```

Servidor local:
- `http://localhost:8787/api/health`
- `http://localhost:8787/api/edge`
- `POST http://localhost:8787/api/ui-price` (captura de preço do DOM via overlay)
- `POST http://localhost:8787/api/ui-context` (contexto da tela aberta para priorizar mercado)


## Latency / Delta Monitor

Camada complementar de diagnóstico que **não substitui o feed principal**:

- compara preço da UI (DOM) vs feed principal (backend)
- compara feed principal vs fonte externa opcional (`EXTERNAL_PRICE_WS`)
- mede atraso estimado da UI e freshness das fontes
- calcula `confidenceAdjustment` para ajustar a confiança do indicador

Campos expostos em `latencyDelta`:
- `uiPrice`, `feedPrice`, `externalPrice`
- `deltaUiVsFeed`, `deltaFeedVsExternal`
- `uiDelayMs`, `feedFreshnessMs`, `externalFreshnessMs`
- `uiLagStatus`, `sourceConflict`, `confidenceAdjustment`

Regras de ajuste:
- feed stale => penalidade
- conflito alto com fonte externa => penalidade
- UI atrasada sozinha => alerta visual (sem penalidade automática)
- fontes alinhadas + feed fresco => bônus leve

## Instalar overlay no Tampermonkey

1. Abra Tampermonkey → **Create a new script**.
2. Copie o conteúdo de `src/overlay/overlay.js`.
3. Salve.
4. Abra `https://polymarket.com`.
5. Verifique o painel no canto superior direito.

## Dicas práticas

- Se o mercado BTC não for detectado automaticamente, defina `MARKET_IDS` no `.env`.
- O log `logs/edge-signals.ndjson` já guarda timestamp, preço BTC, odd, score, subscores, direção e tempo restante.
- Se overlay mostrar “Backend offline”, confirme se o Node está ativo em `localhost:8787`.

## Fases

### Fase 1 (já incluída)
- backend funcional
- websocket conectado
- score calculado
- overlay funcional
- atualização em tempo real

### Fase 2 (parcial)
- reversão e late entry presentes no score
- ranges de entrada/saída presentes no painel

### Fase 3 (futuro)
- análise histórica
- calibração quantitativa
