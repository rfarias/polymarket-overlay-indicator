import { SnapshotsRepo } from "../storage/snapshotsRepo.js";
import { Opportunity } from "../types.js";
import { getNumberArg, hasFlag } from "../utils/args.js";

interface ReviewedOpportunity {
  opportunity: Opportunity;
  decision: "PASS" | "REJECT";
  checks: string[];
}

const args = process.argv.slice(2);
const limit = getNumberArg(args, "--limit", 500);
const includeRejected = hasFlag(args, "--rejected");
const includeExtremeFair = hasFlag(args, "--include-extreme-fair");
const repo = new SnapshotsRepo();
const latest = await repo.listLatestOpportunities(limit);

const candidates = latest.filter(
  (item) => item.suggestion === "TRADE_CANDIDATE" || item.suggestion === "ALERT"
);
const reviewed = candidates.map((opportunity) => reviewOpportunity(opportunity, includeExtremeFair));
const passed = reviewed.filter((item) => item.decision === "PASS");
const rejected = reviewed.filter((item) => item.decision === "REJECT");

console.log("Fila para verificacao detalhada");
console.table([{
  scannedSnapshots: latest.length,
  candidateSignals: candidates.length,
  passed: passed.length,
  rejected: rejected.length
}]);

console.log("Mercados que passaram no filtro conservador");
console.table(passed.map(toRow));

if (includeRejected || passed.length === 0) {
  console.log("Rejeitados pelo filtro");
  console.table(rejected.slice(0, 50).map(toRow));
}

function reviewOpportunity(opportunity: Opportunity, allowExtremeFair: boolean): ReviewedOpportunity {
  const checks: string[] = [];
  const text = [
    opportunity.market.title,
    opportunity.market.description,
    opportunity.market.resolutionRules,
    opportunity.market.category,
    opportunity.market.tags.join(" ")
  ].join("\n");
  const source = opportunity.classification.type;
  const adapter = opportunity.sourceState?.adapter;
  const fair = opportunity.fairYes;
  const spread = opportunity.orderBook.spread;
  const liquidity = opportunity.orderBook.topLiquidity ?? opportunity.market.liquidity;

  if (source === "UNKNOWN" || source === "MANUAL_AMBIGUOUS" || source === "NEWS_EVENT") {
    checks.push(`fonte nao objetiva para verificacao automatica: ${source}`);
  }

  if (!opportunity.estimate || !opportunity.sourceState) {
    checks.push("sem estado/fair value de fonte externa");
  }

  if ((adapter === "exchange-price" || adapter === "chainlink-btc-usd") && !/\bBTC\b|bitcoin/i.test(text)) {
    checks.push(`adapter ${adapter} aplicado em mercado que nao parece BTC`);
  }

  if ((adapter === "exchange-price" || adapter === "chainlink-btc-usd") && !opportunity.sourceState?.target) {
    checks.push("adapter de preco sem alvo numerico extraido");
  }

  if (!allowExtremeFair && fair !== undefined && (fair <= 0.02 || fair >= 0.98)) {
    checks.push(`fair extremo (${fair.toFixed(4)}) exige revisao antes de entrar na amostra`);
  }

  if ((opportunity.netEdge ?? -1) < 0.04) checks.push("edge liquido abaixo do minimo");
  if (opportunity.confidence < 0.55) checks.push("confianca abaixo do minimo");
  if (opportunity.risk >= 0.45) checks.push("risco alto para fila conservadora");
  if (liquidity < 250) checks.push("liquidez baixa");
  if (spread !== undefined && spread > 0.08) checks.push("spread alto");
  if (!opportunity.market.acceptingOrders) checks.push("mercado nao aceita ordens");

  return {
    opportunity,
    decision: checks.length === 0 ? "PASS" : "REJECT",
    checks: checks.length === 0 ? ["passou filtros objetivos"] : checks
  };
}

function toRow(review: ReviewedOpportunity) {
  const item = review.opportunity;
  return {
    decision: review.decision,
    suggestion: item.suggestion,
    source: item.classification.type,
    adapter: item.sourceState?.adapter ?? "n/a",
    netEdge: item.netEdge?.toFixed(4) ?? "n/a",
    fairYes: item.fairYes?.toFixed(4) ?? "n/a",
    priceYesAsk: item.orderBook.bestYesAsk?.toFixed(4) ?? "n/a",
    confidence: item.confidence.toFixed(2),
    risk: item.risk.toFixed(2),
    liquidity: (item.orderBook.topLiquidity ?? item.market.liquidity).toFixed(0),
    check: review.checks.join("; "),
    title: item.market.title.slice(0, 90)
  };
}
