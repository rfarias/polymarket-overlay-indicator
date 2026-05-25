const rows = document.querySelector("#rows");
const metrics = document.querySelector("#metrics");
const scanBtn = document.querySelector("#scanBtn");
const refreshBtn = document.querySelector("#refreshBtn");

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";
  try {
    await fetch("/api/scan", { method: "POST" });
    await load();
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "Run Scan";
  }
});

refreshBtn.addEventListener("click", load);

async function load() {
  const [opportunities, paper] = await Promise.all([
    fetch("/api/opportunities").then((response) => response.json()),
    fetch("/api/paper/report").then((response) => response.json())
  ]);
  renderMetrics(opportunities, paper.report);
  renderRows(opportunities);
}

function renderMetrics(items, report) {
  const counts = items.reduce((acc, item) => {
    acc[item.suggestion] = (acc[item.suggestion] ?? 0) + 1;
    return acc;
  }, {});
  metrics.innerHTML = [
    ["Markets", items.length],
    ["Candidates", counts.TRADE_CANDIDATE ?? 0],
    ["Alerts", counts.ALERT ?? 0],
    ["Avoid", counts.AVOID ?? 0],
    ["Paper Signals", report.totalSignals ?? 0]
  ]
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderRows(items) {
  if (!items.length) {
    rows.innerHTML = `<tr><td colspan="10">No snapshots yet. Run a scan.</td></tr>`;
    return;
  }

  rows.innerHTML = items
    .sort((a, b) => (b.netEdge ?? -1) - (a.netEdge ?? -1))
    .map((item) => {
      const poly = item.orderBook.bestYesAsk ?? item.market.bestAsk;
      return `
        <tr>
          <td><span class="pill ${item.suggestion}">${item.suggestion}</span></td>
          <td class="market">
            ${escapeHtml(item.market.title)}
            <span class="muted">${escapeHtml(item.market.category || item.market.slug || item.market.marketId)}</span>
          </td>
          <td>${item.classification.type}<span class="muted">${escapeHtml(item.classification.sources.join(", "))}</span></td>
          <td>${fmt(poly)}</td>
          <td>${fmt(item.fairYes)}</td>
          <td>${fmtPct(item.netEdge)}</td>
          <td>${fmtPct(item.confidence)}</td>
          <td>${fmtPct(item.risk)}</td>
          <td>${fmt(item.orderBook.topLiquidity ?? item.market.liquidity, 0)}</td>
          <td>${escapeHtml((item.reasons || []).join(" "))}</td>
        </tr>`;
    })
    .join("");
}

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "-";
}

function fmtPct(value) {
  return Number.isFinite(value) ? `${(Number(value) * 100).toFixed(1)}%` : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

load().catch((error) => {
  rows.innerHTML = `<tr><td colspan="10">${escapeHtml(error.message)}</td></tr>`;
});
