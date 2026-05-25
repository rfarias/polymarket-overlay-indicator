import { listCatalogEntries, planSourcesForOpportunity } from "../services/fastSourceCatalog.js";
import { SnapshotsRepo } from "../storage/snapshotsRepo.js";
import { getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const limit = getNumberArg(args, "--limit", 250);
const catalogOnly = hasFlag(args, "--catalog");
const json = hasFlag(args, "--json");

if (catalogOnly) {
  const catalog = listCatalogEntries().map((entry) => ({
    niche: entry.niche,
    priority: entry.priority,
    sources: entry.sources.map((source) => ({
      name: source.name,
      role: source.role,
      access: source.access,
      status: source.status,
      latencyRank: source.latencyRank,
      events: source.events
    }))
  }));
  if (json) console.log(JSON.stringify(catalog, null, 2));
  else console.table(catalog.map((entry) => ({
    niche: entry.niche,
    priority: entry.priority,
    sources: entry.sources.map((source) => `${source.name} (${source.role})`).join("; ")
  })));
  process.exit(0);
}

const repo = new SnapshotsRepo();
const opportunities = await repo.listLatestOpportunities(limit);
const planned = opportunities
  .map((opportunity) => ({ opportunity, plan: planSourcesForOpportunity(opportunity) }))
  .filter((item) => item.plan.niche !== "unknown")
  .sort((a, b) => scorePriority(b.plan.priority) - scorePriority(a.plan.priority) || b.plan.confidence - a.plan.confidence);

const rows = planned.map(({ opportunity, plan }) => ({
  priority: plan.priority,
  niche: plan.niche,
  confidence: plan.confidence.toFixed(2),
  suggestion: opportunity.suggestion,
  sourceType: opportunity.classification.type,
  fastSources: plan.fastSignalSources.map((source) => source.name).join("; ") || "n/a",
  resolutionSources: plan.resolutionSources.map((source) => source.name).join("; ") || "n/a",
  confirmation: plan.confirmationPolicy[0] ?? "n/a",
  title: opportunity.market.title.slice(0, 90)
}));

if (json) {
  console.log(JSON.stringify(planned.map(({ opportunity, plan }) => ({
    marketId: opportunity.market.marketId,
    slug: opportunity.market.slug,
    title: opportunity.market.title,
    suggestion: opportunity.suggestion,
    classifierType: opportunity.classification.type,
    plan
  })), null, 2));
} else {
  console.log("Mercados com plano de fontes rapidas");
  console.table(rows.slice(0, 100));
}

function scorePriority(priority: string): number {
  if (priority === "HIGH") return 3;
  if (priority === "MEDIUM") return 2;
  return 1;
}
