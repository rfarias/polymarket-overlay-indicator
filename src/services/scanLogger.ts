import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Opportunity } from "../types.js";

export interface ScanLogEntry {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scanned: number;
  alerts: number;
  tradeCandidates: number;
  watch: number;
  avoid: number;
  maxNetEdge?: number;
  avgNetEdge?: number;
  avgConfidence: number;
  avgRisk: number;
  top: Array<{
    marketId: string;
    slug: string;
    title: string;
    suggestion: string;
    source: string;
    netEdge?: number;
    confidence: number;
    risk: number;
    bestYesBid?: number;
    bestYesAsk?: number;
    bestNoBid?: number;
    bestNoAsk?: number;
    reasons: string[];
  }>;
}

export function buildScanLogEntry(
  runId: string,
  startedAt: string,
  finishedAt: string,
  opportunities: Opportunity[]
): ScanLogEntry {
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const edges = opportunities
    .map((item) => item.netEdge)
    .filter((edge): edge is number => edge !== undefined && Number.isFinite(edge));
  const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return {
    runId,
    startedAt,
    finishedAt,
    durationMs,
    scanned: opportunities.length,
    alerts: opportunities.filter((item) => item.suggestion === "ALERT").length,
    tradeCandidates: opportunities.filter((item) => item.suggestion === "TRADE_CANDIDATE").length,
    watch: opportunities.filter((item) => item.suggestion === "WATCH").length,
    avoid: opportunities.filter((item) => item.suggestion === "AVOID").length,
    maxNetEdge: edges.length ? Math.max(...edges) : undefined,
    avgNetEdge: avg(edges),
    avgConfidence: avg(opportunities.map((item) => item.confidence)),
    avgRisk: avg(opportunities.map((item) => item.risk)),
    top: opportunities
      .filter((item) => item.suggestion === "ALERT" || item.suggestion === "TRADE_CANDIDATE")
      .sort((a, b) => (b.netEdge ?? -1) - (a.netEdge ?? -1))
      .slice(0, 25)
      .map((item) => ({
        marketId: item.market.marketId,
        slug: item.market.slug,
        title: item.market.title,
        suggestion: item.suggestion,
        source: item.classification.type,
        netEdge: item.netEdge,
        confidence: item.confidence,
        risk: item.risk,
        bestYesBid: item.orderBook.bestYesBid,
        bestYesAsk: item.orderBook.bestYesAsk,
        bestNoBid: item.orderBook.bestNoBid,
        bestNoAsk: item.orderBook.bestNoAsk,
        reasons: item.reasons
      }))
  };
}

export async function appendScanLog(path: string, entry: ScanLogEntry): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
}
