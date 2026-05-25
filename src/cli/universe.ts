import { GammaClient } from "../polymarket/gammaClient.js";
import { evaluateLatencyUniverse } from "../services/latencyUniverse.js";
import { getNumberArg, hasFlag } from "../utils/args.js";

const args = process.argv.slice(2);
const limit = getNumberArg(args, "--limit", 80);
const maxPages = getNumberArg(args, "--max-pages", 1);
const rejected = hasFlag(args, "--rejected");
const json = hasFlag(args, "--json");

const gamma = new GammaClient();
const markets = await gamma.fetchActiveEvents(limit, maxPages);
const evaluated = markets
  .map((market) => ({ market, decision: evaluateLatencyUniverse(market) }))
  .filter((item) => rejected || item.decision.include)
  .sort((a, b) => b.decision.score - a.decision.score);

if (json) {
  console.log(JSON.stringify(evaluated, null, 2));
} else {
  console.log("Universo latency-edge");
  console.table([{
    fetchedMarkets: markets.length,
    shown: evaluated.length,
    included: evaluated.filter((item) => item.decision.include).length,
    rejected: markets.length - evaluated.filter((item) => item.decision.include).length
  }]);
  console.table(
    evaluated.slice(0, 80).map(({ market, decision }) => ({
      include: decision.include,
      priority: decision.priority,
      score: decision.score,
      niche: decision.niche,
      classifier: decision.classification.type,
      liquidity: market.liquidity.toFixed(0),
      endDate: market.endDate ?? "",
      reason: decision.reasons.slice(0, 2).join(" "),
      title: market.title.slice(0, 90)
    }))
  );
}
