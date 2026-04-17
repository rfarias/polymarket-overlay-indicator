// ==UserScript==
// @name         Polymarket Aggressive Edge Overlay
// @namespace    local.polymarket.edge
// @version      0.3.3
// @description  Overlay enxuto para entrada em mercados quase resolvidos
// @match        https://polymarket.com/*
// @match        https://www.polymarket.com/*
// @match        https://*.polymarket.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  const API = 'http://localhost:8787/api/edge';
  const WS_API = 'ws://localhost:8787/ws/edge';
  const UI_POST_API = 'http://localhost:8787/api/ui-price';
  const UI_CONTEXT_API = 'http://localhost:8787/api/ui-context';
  const POLL_MS = 700;
  const POS_KEY = 'aggressive_edge_overlay_pos_v1';

  const CSS = `
${String.raw`#aggressive-edge-overlay{position:fixed;top:88px;right:18px;width:348px;background:linear-gradient(180deg,rgba(15,23,42,.97),rgba(17,24,39,.94));color:#e5e7eb;border:1px solid rgba(148,163,184,.22);border-radius:14px;box-shadow:0 14px 45px rgba(0,0,0,.42);z-index:999999;font-family:Inter,system-ui,sans-serif;font-size:12px;line-height:1.45;backdrop-filter:blur(10px)}#aggressive-edge-overlay .head{padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.08);font-weight:800;letter-spacing:.6px;cursor:move;user-select:none;display:flex;justify-content:space-between;gap:8px}#aggressive-edge-overlay .body{padding:12px 13px}#aggressive-edge-overlay .hero{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}#aggressive-edge-overlay .score{font-size:26px;font-weight:800;line-height:1}#aggressive-edge-overlay .badge{padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(148,163,184,.16)}#aggressive-edge-overlay .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;margin-bottom:10px}#aggressive-edge-overlay .card{padding:8px 9px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.03)}#aggressive-edge-overlay .label{display:block;font-size:10px;font-weight:700;letter-spacing:.3px;color:#94a3b8;text-transform:uppercase;margin-bottom:3px}#aggressive-edge-overlay .value{display:block;font-size:15px;font-weight:700}#aggressive-edge-overlay .mini{font-size:11px;color:#cbd5e1}#aggressive-edge-overlay .row{display:flex;justify-content:space-between;gap:10px;margin-bottom:5px}#aggressive-edge-overlay .yes{color:#22c55e}#aggressive-edge-overlay .no{color:#ef4444}#aggressive-edge-overlay .attention{color:#facc15}#aggressive-edge-overlay .warning{color:#fb923c}#aggressive-edge-overlay .danger{color:#f87171}#aggressive-edge-overlay .good{color:#4ade80}#aggressive-edge-overlay .muted{color:#94a3b8}#aggressive-edge-overlay .sep{height:1px;background:rgba(255,255,255,.08);margin:9px 0}#aggressive-edge-overlay .title{font-weight:800;font-size:10px;color:#cbd5e1;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px}#aggressive-edge-overlay .footer{margin-top:8px;padding:9px 10px;border-radius:10px;background:rgba(15,118,110,.12);border:1px solid rgba(45,212,191,.15)}`}
  `;

  let lastUiPrice = null;
  let lastUiUpdatedAt = 0;
  let ws;
  let root = null;
  let started = false;
  let wsBlocked = false;

  function getXmlHttpRequest() {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    if (typeof GM === 'object' && typeof GM.xmlHttpRequest === 'function') {
      return GM.xmlHttpRequest.bind(GM);
    }
    return null;
  }

  function getAddStyle() {
    if (typeof GM_addStyle === 'function') return GM_addStyle;
    return null;
  }

  function loadPosition() {
    if (!root) return;
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      if (Number.isFinite(saved.left)) root.style.left = `${saved.left}px`;
      if (Number.isFinite(saved.top)) root.style.top = `${saved.top}px`;
      if (Number.isFinite(saved.left)) root.style.right = 'auto';
    } catch {}
  }

  function savePosition(left, top) {
    localStorage.setItem(POS_KEY, JSON.stringify({ left, top }));
  }

  function enableDrag() {
    if (!root) return;
    const head = root.querySelector('.head');
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;

    head.addEventListener('mousedown', (e) => {
      dragging = true;
      const rect = root.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      baseLeft = rect.left;
      baseTop = rect.top;
      root.style.left = `${baseLeft}px`;
      root.style.top = `${baseTop}px`;
      root.style.right = 'auto';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const nextLeft = Math.max(0, Math.min(window.innerWidth - root.offsetWidth, baseLeft + (e.clientX - startX)));
      const nextTop = Math.max(0, Math.min(window.innerHeight - root.offsetHeight, baseTop + (e.clientY - startY)));
      root.style.left = `${nextLeft}px`;
      root.style.top = `${nextTop}px`;
      savePosition(nextLeft, nextTop);
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function row(label, value, css = '') {
    return `<div class="row"><span class="muted">${label}</span><span class="${css}">${value ?? '-'}</span></div>`;
  }

  function card(label, value, extra = '', css = '') {
    return `<div class="card"><span class="label">${label}</span><span class="value ${css}">${value ?? '-'}</span>${extra ? `<span class="mini">${extra}</span>` : ''}</div>`;
  }

  function fmtTime(sec = 0) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function fmtMs(ms) {
    if (!Number.isFinite(ms)) return '-';
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms)}ms`;
  }

  function fmtUsd(value, digits = 1) {
    if (!Number.isFinite(value)) return '-';
    return value.toFixed(digits);
  }

  function sendJson(url, payload) {
    const xhr = getXmlHttpRequest();
    if (xhr) {
      xhr({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload)
      });
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  function findUiBtcPrice() {
    const candidates = [...document.querySelectorAll('span,div,p')].slice(0, 300);
    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      if (!text || text.length > 28) continue;
      const clean = text.replace(/[$,\s]/g, '');
      if (!/^\d{4,7}(\.\d+)?$/.test(clean)) continue;
      const value = Number(clean);
      if (!Number.isFinite(value)) continue;
      if (value < 1000 || value > 500000) continue;
      return value;
    }
    return null;
  }

  function sendUiContext() {
    sendJson(UI_CONTEXT_API, {
      pageUrl: window.location.href,
      marketHint: document.title
    });
  }

  function trackDomUiPrice() {
    const value = findUiBtcPrice();
    if (!Number.isFinite(value)) return;
    if (lastUiPrice === null || Math.abs(value - lastUiPrice) >= 0.01) {
      lastUiPrice = value;
      lastUiUpdatedAt = Date.now();
      sendJson(UI_POST_API, { uiPrice: lastUiPrice, uiUpdatedAt: lastUiUpdatedAt });
    }
  }

  function latencyTone(latencyDelta) {
    if (!latencyDelta) return 'muted';
    const stale = Number.isFinite(latencyDelta.feedFreshnessMs) && latencyDelta.feedFreshnessMs > 1500;
    if (stale || latencyDelta.sourceConflict === 'high') return 'danger';
    if (latencyDelta.uiLagStatus === 'high') return 'warning';
    if (latencyDelta.uiLagStatus === 'medium' || latencyDelta.sourceConflict === 'medium') return 'attention';
    return 'good';
  }

  function riskTone(label) {
    if (label === 'Alto') return 'danger';
    if (label === 'Médio') return 'attention';
    return 'good';
  }

  function safetyTone(label) {
    if (label === 'Seguro') return 'good';
    if (label === 'Observando') return 'attention';
    return 'danger';
  }

  function render(snapshot) {
    if (!root) return;
    const edge = snapshot?.edge;
    const latencyDelta = snapshot?.latencyDelta;

    if (!edge) {
      root.querySelector('.body').innerHTML = '<div class="attention">Sem leitura ainda.</div>';
      return;
    }

    const dirClass = edge.direction === 'YES' ? 'yes' : edge.direction === 'NO' ? 'no' : 'attention';
    const delayTone = Number.isFinite(edge.gapToFair) && Math.abs(edge.gapToFair) >= 1.4 ? 'attention' : 'muted';
    const entryCss = edge.entryPlan?.safeToEnter ? 'good' : 'warning';
    const lagLabel = latencyDelta?.uiLagStatus === 'high' ? 'UI atrasada' : latencyDelta?.uiLagStatus === 'medium' ? 'UI com leve atraso' : 'UI alinhada';
    const fairOddsText = Number.isFinite(edge.fairOdds) ? `${edge.fairOdds.toFixed(1)}%` : '-';
    const marketOddsText = Number.isFinite(edge.marketOdds) ? `${edge.marketOdds.toFixed(1)}%` : '-';
    const gapText = Number.isFinite(edge.gapToFair) ? `${edge.gapToFair >= 0 ? '+' : ''}${edge.gapToFair.toFixed(1)} pts` : '-';
    const targetPctText = Number.isFinite(edge.targetDistancePct) ? `${edge.targetDistancePct >= 0 ? '+' : ''}${edge.targetDistancePct.toFixed(3)}%` : '-';

    root.querySelector('.body').innerHTML = [
      `<div class="hero"><div><div class="score ${dirClass}">${edge.directionLabel}</div><div class="mini">Entrada: <span class="${safetyTone(edge.safety)}">${edge.safety}</span></div></div><div class="badge ${safetyTone(edge.safety)}">${edge.score}/100</div></div>`,
      '<div class="grid">',
      card('Preço API', fmtUsd(edge.referencePrice), edge.referenceSource),
      card('Mercado', marketOddsText, 'Polymarket implícito'),
      card('Odds justas', fairOddsText, `delay ${gapText}`, delayTone),
      card('Target', fmtUsd(edge.targetDistanceAbs), targetPctText),
      '</div>',
      row('Risco de reversão', edge.reversalRisk, riskTone(edge.reversalRisk)),
      row('Volatilidade 10-15s', `${edge.volatility} (${edge.volatilityPct?.toFixed?.(3) ?? '-'}%)`, edge.volatility === 'Alta' ? 'danger' : edge.volatility === 'Média' ? 'attention' : 'good'),
      row('Book', edge.bookBias),
      row('Fluxo', edge.tradeBias),
      row('Tempo para fechar', fmtTime(edge.remainingTimeSec), edge.remainingTimeSec <= 20 ? 'warning' : 'muted'),
      row('Status do delay', lagLabel, latencyTone(latencyDelta)),
      '<div class="sep"></div>',
      '<div class="title">Entrada sugerida</div>',
      row('Direção', edge.entryPlan?.limitDirection || '-', dirClass),
      row('Preço limite', edge.entryPlan?.limitPrice ? `${edge.entryPlan.limitPrice}%` : '-', entryCss),
      row('Faixa', edge.entryPlan?.limitPriceBand ? `${edge.entryPlan.limitPriceBand}%` : '-', entryCss),
      `<div class="footer"><div class="row"><span class="muted">Leitura</span><span class="${entryCss}">${edge.entryPlan?.status || '-'}</span></div><div class="mini">${edge.entryPlan?.reason || 'Sem plano de entrada.'}</div></div>`,
      '<div class="sep"></div>',
      '<div class="title">Latência</div>',
      row('Polymarket UI vs API', latencyDelta?.deltaUiVsFeed?.toFixed?.(2)),
      row('API vs Binance/Coinbase', latencyDelta?.deltaFeedVsExternal?.toFixed?.(2)),
      row('UI Delay', fmtMs(latencyDelta?.uiDelayMs)),
      row('Feed freshness', fmtMs(latencyDelta?.feedFreshnessMs))
    ].join('');
  }

  function requestEdge() {
    const xhr = getXmlHttpRequest();
    if (xhr) {
      xhr({
        method: 'GET',
        url: API,
        onload: (res) => {
          try {
            render(JSON.parse(res.responseText));
          } catch {
            root.querySelector('.body').innerHTML = '<div class="attention">Falha ao ler API local.</div>';
          }
        },
        onerror: () => {
          root.querySelector('.body').innerHTML = '<div class="attention">Backend offline.</div>';
        }
      });
      return;
    }

    fetch(API)
      .then((r) => r.json())
      .then(render)
      .catch(() => {
        root.querySelector('.body').innerHTML = '<div class="attention">Backend offline.</div>';
      });
  }

  function connectRealtime() {
    if (wsBlocked) return;
    if (window.location.protocol === 'https:' && WS_API.startsWith('ws://')) {
      wsBlocked = true;
      return;
    }

    try {
      ws = new WebSocket(WS_API);
      ws.onmessage = (ev) => {
        try {
          render(JSON.parse(ev.data));
        } catch {}
      };
      ws.onclose = () => setTimeout(connectRealtime, 1500);
      ws.onerror = () => {
        wsBlocked = window.location.protocol === 'https:' && WS_API.startsWith('ws://');
        try { ws.close(); } catch {}
      };
    } catch {
      setTimeout(connectRealtime, 1500);
    }
  }

  function mountOverlay() {
    const styleInjector = getAddStyle()
      ? getAddStyle()
      : (css) => {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      };
    styleInjector(CSS);

    root = document.createElement('div');
    root.id = 'aggressive-edge-overlay';
    root.innerHTML = `<div class="head"><span>AGGRESSIVE EDGE</span><span class="muted">0.3.3</span></div><div class="body"><div class="muted">Carregando dados locais...</div></div>`;
    document.body.appendChild(root);
  }

  function start() {
    if (started || !document.body) return;
    started = true;
    mountOverlay();

    const observer = new MutationObserver(() => {
      trackDomUiPrice();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    loadPosition();
    enableDrag();
    sendUiContext();
    connectRealtime();
    trackDomUiPrice();
    requestEdge();

    setInterval(() => {
      trackDomUiPrice();
      sendUiContext();
      requestEdge();
    }, POLL_MS);
  }

  if (document.body) {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', start, { once: true });
  }
})();
