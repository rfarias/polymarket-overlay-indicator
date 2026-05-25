import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { AgentService } from "../services/agentService.js";
import { buildPaperReport } from "../paper/backtester.js";
import { initDb } from "../storage/db.js";

const app = express();
const service = new AgentService();
const dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(dirname, "../ui/dashboard");

app.use(express.json());
app.use(express.static(uiDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: "paper", realTradingEnabled: false });
});

app.post("/api/scan", async (_req, res, next) => {
  try {
    const opportunities = await service.scan();
    res.json({ count: opportunities.length, opportunities });
  } catch (error) {
    next(error);
  }
});

app.get("/api/opportunities", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 100);
    res.json(await service.latest(limit));
  } catch (error) {
    next(error);
  }
});

app.get("/api/paper/report", async (_req, res, next) => {
  try {
    const trades = await service.repoInstance().listPaperTrades();
    res.json({ report: buildPaperReport(trades), trades });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({ error: message });
});

await initDb();

app.listen(config.port, () => {
  console.log(`polymarket-resolution-edge-agent listening on http://127.0.0.1:${config.port}`);
});
