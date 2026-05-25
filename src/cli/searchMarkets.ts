import { GammaClient } from "../polymarket/gammaClient.js";
import { getArgValue, getNumberArg } from "../utils/args.js";

const args = process.argv.slice(2);
const query = getArgValue(args, "--query", "")!.toLowerCase();
const limit = getNumberArg(args, "--limit", 100);
const maxPages = getNumberArg(args, "--max-pages", 5);

const markets = await new GammaClient().fetchActiveEvents(limit, maxPages);
const terms = query.split(",").map((term) => term.trim()).filter(Boolean);
const matched = markets.filter((market) => {
  const text = [
    market.title,
    market.description,
    market.resolutionRules,
    market.category,
    market.tags.join(" ")
  ].join("\n").toLowerCase();
  return terms.length === 0 || terms.some((term) => text.includes(term));
});

console.log(`Fetched ${markets.length} markets. Matched ${matched.length}.`);
console.table(
  matched.slice(0, 120).map((market) => ({
    title: market.title.slice(0, 100),
    category: market.category ?? "",
    tags: market.tags.slice(0, 4).join(", "),
    liquidity: market.liquidity.toFixed(0),
    endDate: market.endDate ?? "",
    slug: market.slug.slice(0, 80)
  }))
);
