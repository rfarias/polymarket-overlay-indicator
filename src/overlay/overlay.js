// ==UserScript==
// @name         Polymarket Aggressive Edge Overlay
// @namespace    local.polymarket.edge
// @version      0.3.1
// @description  Overlay local com score agressivo + monitor de latency/delta
// @match        https://polymarket.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
  const API = 'http://localhost:8787/api/edge';
  const WS_API = 'ws://localhost:8787/ws/edge';
  const UI_POST_API = 'http://localhost:8787/api/ui-price';
  const UI_CONTEXT_API = 'http://localhost:8787/api/ui-context';
  const POLL_MS = 700;
  const POS_KEY = 'aggressive_edge_overlay_pos_v1';

  const CSS = `
${String.raw`#aggressive-edge-overlay{position:fixed;top:88px;right:18px;width:315px;background:rgba(17,24,39,.92);color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);z-index:999999;font-family:Inter,system-ui,sans-serif;font-size:12px;line-height:1.45}#aggressive-edge-overlay .head{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);font-weight:700;letter-spacing:.4px;cursor:move;user-select:none}#aggressive-edge-overlay .body{padding:10px 12px}#aggressive-edge-overlay .score{font-size:24px;font-weight:800}#aggressive-edge-overlay .row{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}#aggressive-edge-overlay .yes{color:#22c55e}#aggressive-edge-overlay .no{color:#ef4444}#aggressive-edge-overlay .attention{color:#facc15}#aggressive-edge-overlay .warning{color:#fb923c}#aggressive-edge-overlay .danger{color:#ef4444}#aggressive-edge-overlay .good{color:#22c55e}#aggressive-edge-overlay .muted{color:#9ca3af}#aggressive-edge-overlay .sep{height:1px;background:rgba(255,255,255,.1);margin:8px 0}#aggressive-edge-overlay .title{font-weight:700;font-size:11px;color:#cbd5e1;margin-bottom:6px}`}
  `;

  const styleInjector = typeof GM_addStyle === 'function'
    ? GM_addStyle
    : (css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    };
  styleInjector(CSS);

  const root = document.createElement('div');
  root.id = 'aggressive-edge-overlay';
  root.innerHTML = `<div class="head">AGGRESSIVE EDGE</div><div class="body"><div class="muted">Carregando dados locais...</div></div>`;
  document.body.appendChild(root);

  let lastUiPrice = null;
  let lastUiUpdatedAt = 0;
  let ws;

  function loadPosition() {
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

  function sendJson(url, payload) {
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
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

  function render(snapshot) {
    const edge = snapshot?.edge;
    const latencyDelta = snapshot?.latencyDelta;

    if (!edge) {
      root.querySelector('.body').innerHTML = '<div class="attention">Sem score ainda.</div>';
      return;
    }

    const dirClass = edge.direction === 'YES' ? 'yes' : 'no';
    const arrow = edge.direction === 'YES' ? '↑' : '↓';

    const lagLabel = latencyDelta?.uiLagStatus === 'high' ? 'UI atrasada' : latencyDelta?.uiLagStatus === 'medium' ? 'UI com leve atraso' : 'UI alinhada';
    const conflictLabel = latencyDelta?.sourceConflict === 'high' ? 'alto' : latencyDelta?.sourceConflict === 'medium' ? 'médio' : 'baixo';

    root.querySelector('.body').innerHTML = [
      `<div class="score ${dirClass}">Score: ${edge.score}</div>`,
      row('Score ajustado', edge.adjustedScore, 'attention'),
      row('Direção', `${arrow} ${edge.direction}`, dirClass),
      row('Confiança', `${edge.adjustedConfidence} (${edge.confidenceAdjustment >= 0 ? '+' : ''}${edge.confidenceAdjustment})`),
      row('Momentum', edge.momentumStrength),
      row('Book imbalance', edge.bookBias),
      row('Trade pressure', edge.tradeBias),
      row('Distância target', edge.targetDistance),
      row('Tempo restante', fmtTime(edge.remainingTimeSec)),
      row('Entrada ideal', edge.entryIdeal),
      row('Saída curta', edge.shortExit),
      row('Late entry >', String(edge.lateEntryAbove), 'attention'),
      row('Risco reversão', edge.reversalRisk, edge.reversalRisk === 'Alto' ? 'attention' : ''),
      row('Faixa', edge.band),
      '<div class="sep"></div>',
      '<div class="title">LATENCY / DELTA</div>',
      row('UI', latencyDelta?.uiPrice?.toFixed?.(1)),
      row('Feed', latencyDelta?.feedPrice?.toFixed?.(1)),
      row('External', latencyDelta?.externalPrice?.toFixed?.(1)),
      row('UI Delay', fmtMs(latencyDelta?.uiDelayMs)),
      row('Feed Freshness', fmtMs(latencyDelta?.feedFreshnessMs)),
      row('External Freshness', fmtMs(latencyDelta?.externalFreshnessMs)),
      row('Delta UI vs Feed', latencyDelta?.deltaUiVsFeed?.toFixed?.(2)),
      row('Delta Feed vs External', latencyDelta?.deltaFeedVsExternal?.toFixed?.(2)),
      row('Status', lagLabel, latencyTone(latencyDelta)),
      row('Conflict', conflictLabel, latencyTone(latencyDelta)),
      row('Confidence Adj', String(latencyDelta?.confidenceAdjustment ?? 0), (latencyDelta?.confidenceAdjustment ?? 0) < 0 ? 'danger' : 'good')
    ].join('');
  }

  function requestEdge() {
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
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
    try {
      ws = new WebSocket(WS_API);
      ws.onmessage = (ev) => {
        try {
          render(JSON.parse(ev.data));
        } catch {}
      };
      ws.onclose = () => setTimeout(connectRealtime, 1500);
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    } catch {
      setTimeout(connectRealtime, 1500);
    }
  }

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
})();
