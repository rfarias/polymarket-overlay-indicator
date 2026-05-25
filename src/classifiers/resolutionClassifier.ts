import { MarketSummary, ResolutionClassification, ResolutionType } from "../types.js";

const rules: Array<{ type: ResolutionType; sources: string[]; patterns: RegExp[]; risk: number }> = [
  {
    type: "CHAINLINK_PRICE_FEED",
    sources: ["Chainlink"],
    patterns: [/chainlink/i, /data feeds?/i, /btc\/usd/i],
    risk: 0.2
  },
  {
    type: "EXCHANGE_PRICE",
    sources: ["Binance", "Coinbase", "Bybit"],
    patterns: [/binance/i, /coinbase/i, /bybit/i, /kraken/i, /spot price/i, /\bbtc\/usd\b/i, /\bbtc-usd\b/i, /\bbitcoin price\b/i, /\bbtc price\b/i],
    risk: 0.25
  },
  {
    type: "OFFICIAL_WEBSITE",
    sources: ["official website"],
    patterns: [/official website/i, /official site/i, /according to .*official/i, /\.gov/i],
    risk: 0.35
  },
  {
    type: "SPORTS_SCORE_PROVIDER",
    sources: ["sports score provider"],
    patterns: [/nba|nfl|mlb|nhl|uefa|fifa|premier league|espn|sports/i],
    risk: 0.35
  },
  {
    type: "WEATHER_DATA",
    sources: ["weather API"],
    patterns: [/weather|temperature|rainfall|hurricane|noaa|wind speed/i],
    risk: 0.35
  },
  {
    type: "ECONOMIC_RELEASE",
    sources: ["government economic release"],
    patterns: [/cpi|inflation|unemployment|fed|fomc|bureau of labor|bea|economic/i],
    risk: 0.3
  },
  {
    type: "SOCIAL_MEDIA_POST",
    sources: ["X/Twitter"],
    patterns: [/twitter|x\.com|tweet|post on x/i],
    risk: 0.45
  },
  {
    type: "NEWS_EVENT",
    sources: ["public news"],
    patterns: [/news|reuters|associated press|announcement|reported by/i],
    risk: 0.5
  }
];

export class ResolutionClassifier {
  classify(market: MarketSummary): ResolutionClassification {
    const text = [
      market.title,
      market.description,
      market.resolutionRules,
      market.category,
      market.tags.join(" ")
    ].join("\n");

    if (/ambiguous|subject to|dispute|uma|credible reporting|substantial evidence/i.test(text)) {
      return {
        type: "MANUAL_AMBIGUOUS",
        sources: extractKnownSources(text),
        confidence: 0.35,
        ambiguityRisk: 0.8,
        reason: "Rules mention ambiguity, UMA dispute, or subjective evidence."
      };
    }

    const matches = rules
      .map((rule) => ({
        rule,
        score: rule.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return {
        type: "UNKNOWN",
        sources: extractKnownSources(text),
        confidence: 0.1,
        ambiguityRisk: 0.7,
        reason: "No clear public resolution source found in title, description, tags, or rules."
      };
    }

    const best = matches[0];
    const confidence = Math.min(0.9, 0.45 + best.score * 0.15);
    return {
      type: best.rule.type,
      sources: Array.from(new Set([...best.rule.sources, ...extractKnownSources(text)])),
      confidence,
      ambiguityRisk: best.rule.risk,
      reason: `Matched ${best.rule.type} using ${best.score} source hint(s).`
    };
  }
}

function extractKnownSources(text: string): string[] {
  const sources = [
    ["Chainlink", /chainlink/i],
    ["Binance", /binance/i],
    ["Coinbase", /coinbase/i],
    ["Bybit", /bybit/i],
    ["X/Twitter", /twitter|x\.com/i],
    ["Government site", /\.gov|government|bureau/i],
    ["Official website", /official website|official site/i]
  ] as const;

  return sources.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
