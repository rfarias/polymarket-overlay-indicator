import { ResolutionClassifier } from "../classifiers/resolutionClassifier.js";
import { planSourcesForMarket } from "./fastSourceCatalog.js";
import { MarketSummary, ResolutionClassification } from "../types.js";
import { hoursUntil } from "../utils/http.js";

export interface LatencyUniverseDecision {
  include: boolean;
  priority: "HOT" | "WARM" | "COLD" | "REJECT";
  niche: string;
  score: number;
  classification: ResolutionClassification;
  reasons: string[];
}

const classifier = new ResolutionClassifier();

const fastEventPatterns = [
  /\blive\b|\bin[- ]?play\b|\bin game\b|\btoday\b|\btonight\b|\bthis match\b|\bthis game\b/i,
  /\bgoal\b|\bcorner\b|\bcorners\b|\bpenalty\b|\bred card\b|\byellow card\b|\bcard\b|\bvar\b/i,
  /\bpoints\b|\brebounds\b|\bassists\b|\bsteals\b|\bblocks\b|\b3-pointers\b|\bthree-pointers\b/i,
  /\btennis\b|\batp\b|\bwta\b|\bsets?\b|\bbreak point\b|\bserve\b/i,
  /\bbtc\b|\bbitcoin\b|\beth\b|\bethereum\b|\bsol\b|\bsolana\b|\bprice\b|\babove\b|\bbelow\b|\bhit\b/i,
  /\bcpi\b|\binflation\b|\bunemployment\b|\bfomc\b|\binterest rate\b|\bgdp\b|\bppi\b|\bjobs report\b/i,
  /\bearthquake\b|\bhurricane\b|\bstorm\b|\btemperature\b|\brain\b|\bsnow\b|\bwind\b|\bnoaa\b/i,
  /\bsec\b|\bedgar\b|\bfiling\b|\b8-k\b|\bs-1\b|\bearnings\b|\bpress release\b/i,
  /\bbreaking\b|\breported\b|\bannouncement\b|\bresigns\b|\barrested\b|\bindicted\b|\bsuspended\b/i
];

const slowOrSubjectivePatterns = [
  /\belection\b|\bsenate race\b|\bpresidential\b|\bnominee\b|\bapproval rating\b/i,
  /\bmarket cap\b|\bipo day\b|\bipo by\b|\bvaluation\b/i,
  /\bwho will win\b|\bwill .* win\b/i,
  /\bwin the .* finals\b|\bwin the .* cup\b|\bstanley cup\b|\bnba finals\b|\bsuper bowl\b|\bworld series\b/i,
  /\bby december 31, 2026\b|\bin 2026\b|\bin 2027\b/i,
  /\bperson [a-j]\b/i,
  /\bcredible reporting\b|\bsubstantial evidence\b|\bsubject to\b|\bambiguous\b/i
];

const sportsPatterns = [
  /\bfootball\b|\bsoccer\b|\bfifa\b|\buefa\b|\bconmebol\b|\bcbf\b|\blibertadores\b|\bchampions league\b/i,
  /\bbasketball\b|\bnba\b|\bwnba\b|\bfiba\b|\beuroleague\b/i,
  /\btennis\b|\batp\b|\bwta\b|\bgrand slam\b/i,
  /\bnfl\b|\bmlb\b|\bnhl\b|\bhockey\b|\bcollege football\b/i
];

export function evaluateLatencyUniverse(market: MarketSummary): LatencyUniverseDecision {
  const text = marketText(market);
  const classification = classifier.classify(market);
  const plan = planSourcesForMarket(market, classification.type);
  const timeLeft = hoursUntil(market.endDate);
  const reasons: string[] = [];
  let score = 0;

  const fastMatches = countMatches(text, fastEventPatterns);
  const sportsMatches = countMatches(text, sportsPatterns);
  const slowMatches = countMatches(text, slowOrSubjectivePatterns);

  score += fastMatches * 15;
  score += sportsMatches * 20;
  if (plan.priority === "HIGH") score += 20;
  if (plan.priority === "MEDIUM") score += 10;
  if (plan.fastSignalSources.length > 0) score += 15;
  if (classification.type === "EXCHANGE_PRICE" || classification.type === "CHAINLINK_PRICE_FEED") score += 20;
  if (classification.type === "SPORTS_SCORE_PROVIDER") score += 20;
  if (classification.type === "WEATHER_DATA" || classification.type === "ECONOMIC_RELEASE") score += 10;
  if (classification.type === "SOCIAL_MEDIA_POST" || classification.type === "NEWS_EVENT") score += 5;

  if (timeLeft !== undefined) {
    if (timeLeft <= 0) score -= 100;
    else if (timeLeft <= 6) score += 20;
    else if (timeLeft <= 48) score += 10;
    else if (timeLeft > 24 * 180) score -= 25;
  }

  score -= slowMatches * 20;
  if (classification.type === "UNKNOWN" || classification.type === "MANUAL_AMBIGUOUS") score -= 25;
  if (!market.acceptingOrders || market.closed || !market.active) score -= 100;
  if (!market.tokenIds.length) score -= 20;

  const isSlowSportsFuture = sportsMatches > 0 && slowMatches > 0 && fastMatches === 0 && (timeLeft === undefined || timeLeft > 48);
  if (isSlowSportsFuture) {
    score -= 60;
    reasons.push("Sports future without live/near-term event trigger.");
  }

  if (fastMatches) reasons.push(`Matched ${fastMatches} fast-event pattern(s).`);
  if (sportsMatches) reasons.push(`Matched ${sportsMatches} sports pattern(s).`);
  if (slowMatches) reasons.push(`Rejected/penalized by ${slowMatches} slow-subjective pattern(s).`);
  if (plan.fastSignalSources.length) reasons.push(`Fast sources available for niche ${plan.niche}.`);
  if (timeLeft !== undefined) reasons.push(`Hours until end: ${timeLeft.toFixed(1)}.`);
  reasons.push(`Classifier: ${classification.type}.`);

  const include = score >= 35 && slowMatches < 2 && !isSlowSportsFuture;
  return {
    include,
    priority: include ? (score >= 75 ? "HOT" : score >= 50 ? "WARM" : "COLD") : "REJECT",
    niche: plan.niche,
    score,
    classification,
    reasons
  };
}

export function filterLatencyUniverse(markets: MarketSummary[]): Array<{
  market: MarketSummary;
  decision: LatencyUniverseDecision;
}> {
  return markets
    .map((market) => ({ market, decision: evaluateLatencyUniverse(market) }))
    .filter((item) => item.decision.include)
    .sort((a, b) => b.decision.score - a.decision.score);
}

function marketText(market: MarketSummary): string {
  return [
    market.title,
    market.description,
    market.resolutionRules,
    market.category,
    market.tags.join(" ")
  ].join("\n");
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}
