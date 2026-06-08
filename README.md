# polymarket-resolution-edge-agent

Agente local em modo coleta/log/paper trading para procurar assimetrias entre dados publicos de resolucao e precos da Polymarket.

O projeto nao executa trades reais. Ele busca mercados ativos, tenta identificar a fonte de resolucao, consulta fontes publicas iniciais para mercados BTC/crypto, estima fair value, aplica filtros de risco e salva snapshots/paper signals.

## Instalar

```bash
npm install
cp .env.example .env
```

No PowerShell, use:

```powershell
Copy-Item .env.example .env
```

## Coletar dados

```bash
npm run scan
```

O comando acima executa uma varredura, salva snapshots e paper signals em `local.db`, e adiciona um resumo da rodada em:

```text
logs/scans.jsonl
```

Para coletar continuamente:

```bash
npm run collect -- --interval-secs 300
```

Para monitorar apenas mercados com tese de latencia/evento rapido:

```bash
npm run monitor -- --interval-secs 30 --limit 80 --max-pages 1
```

Para ver antes quais mercados entrariam nesse universo:

```bash
npm run universe -- --limit 80 --max-pages 1
```

Esse modo prioriza esportes ao vivo, cripto/preco, clima, macro, filings e noticias rapidas com fonte de confirmacao. Ele penaliza mercados distantes/subjetivos como eleicoes longas, IPO/market cap generico e perguntas sem evento rapido.

Para limitar a quantidade de rodadas, por exemplo 12 scans:

```bash
npm run collect -- --interval-secs 300 --runs 12
```

## Ver relatorio

```bash
npm run report
```

## Avaliar paper trading

As novas entradas usam `MAX_PAPER_STAKE=10`, ou seja, simulam US$10 por sinal.

Para avaliar as entradas contra snapshots posteriores do mesmo mercado:

```bash
npm run paper
```

O relatorio calcula mark-to-market com:

- preco de entrada paper
- preco observado depois nos snapshots
- PnL estimado
- ROI medio
- win rate

## Estudos de setup

- [Early Leader inversion crypto Up/Down](docs/early-leader-inversion.md): runner paper para inversao do lider inicial em mercados cripto 5m, com versao enriquecida por price-to-beat, distancia em bps e volatilidade recente.
- [Exhaustion reversal backtest](docs/exhaustion-reversal-backtest.md): motor offline para testar reversoes por Z-Score, distancia ate o Price to Beat, volume de agressao, desaceleracao, odds baratas, slippage e latencia.
- [Log snapshot setup replay](docs/log-snapshot-setup-replay.md): metodo para converter snapshots dos logs em dataset de replay, simular o catalogo de setups e comparar gates candidatos.
- [Next PC handoff](docs/next-pc-handoff.md): estado da base consolidada, setups, logs e plano para continuar a unificacao de logs entre PCs sem inflar o Git.
- tamanho de amostra
- classificacao simples de significancia

Preset atual recomendado para o estudo Early Leader:

```bash
npm run el-inversion-sol-xrp
```

Esse preset roda apenas SOL/XRP em paper, com janela de 15-60s para o fim, `max-entry-ask=0.65` e `stop-bid=0.55`. BTC/ETH ficam fora do paper principal; para observar sinais sem abrir paper trade:

```bash
npm run el-inversion-observe-btc-eth
```

Sem snapshots posteriores a entrada, o trade fica sem avaliacao. Para gerar dados avaliaveis, rode `collect` continuamente por horas/dias e use `paper` depois.

Para filtrar os sinais antes da verificacao detalhada:

```bash
npm run verify
```

Para sugerir fontes rapidas por mercado/nicho:

```bash
npm run sources -- --limit 500
```

Para listar o catalogo de fontes configurado:

```bash
npm run sources -- --catalog
```

Para ver tambem os sinais rejeitados e o motivo:

```bash
npm run verify -- --rejected
```

Para saida completa em JSON:

```bash
npm run report -- --json
```

## Dashboard opcional

```bash
npm run dev
```

Abra:

```text
http://127.0.0.1:8787
```

## Comandos

```bash
npm run scan
npm run collect -- --interval-secs 300
npm run monitor -- --interval-secs 30
npm run universe -- --limit 80
npm run report
npm run build
```

## O que o MVP faz

- Busca eventos ativos na Gamma API com paginacao por offset.
- Normaliza dados de mercados, outcomes, token ids, volume, liquidez e regras.
- Classifica a fonte de resolucao em tipos como `CHAINLINK_PRICE_FEED`, `EXCHANGE_PRICE`, `OFFICIAL_WEBSITE`, `UNKNOWN` e `MANUAL_AMBIGUOUS`.
- Usa adapter inicial de BTC/crypto com ticker publico da Binance.
- Mantem adapter Chainlink BTC preparado para mercados BTC com regras Chainlink, tratando risco de latencia/stale feed.
- Busca best bid/ask via CLOB quando token ids existem.
- Calcula fair YES/NO, edge bruto, edge liquido, confianca e risco.
- Bloqueia automaticamente mercados desconhecidos, ambiguos, com fonte stale, spread alto ou liquidez baixa.
- Gera sinais `WATCH`, `ALERT`, `TRADE_CANDIDATE` e `AVOID`.
- Salva snapshots e paper trades em SQLite local via libSQL.
- Exibe oportunidades no dashboard local.

## Escopo de seguranca

Este projeto usa apenas dados publicos e fontes permitidas. Ele nao usa informacao privilegiada, vazamentos, scraping proibido ou execucao automatica real.

Execucao real de ordens deve continuar fora do MVP ate que o paper trading gere resultado consistente e sejam adicionadas travas de stake, perda diaria, cancelamento e dry-run obrigatorio.

## Estrutura

```text
src/
  adapters/
  classifiers/
  cli/
  engine/
  paper/
  polymarket/
  server/
  services/
  storage/
  ui/dashboard/
```

## Proximos passos tecnicos

- Melhorar extracao de regras por mercado e URLs oficiais.
- Trocar a leitura Chainlink por provider RPC configuravel sem depender de API explorer.
- Adicionar WebSocket CLOB em tempo real.
- Fechar paper trades com resultado final do mercado.
- Adicionar relatorios por categoria, fonte, faixa de edge e tempo restante.
