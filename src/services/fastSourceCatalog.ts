import { MarketSummary, Opportunity, ResolutionType } from "../types.js";

export type SourceRole = "RESOLUTION" | "FAST_SIGNAL" | "ODDS_REFERENCE" | "VALIDATION";
export type AccessModel = "PUBLIC_API" | "PAID_API" | "OFFICIAL_SITE" | "EXPERIMENTAL" | "MANUAL";
export type IntegrationStatus = "READY_TO_INTEGRATE" | "NEEDS_KEY" | "NEEDS_TERMS_REVIEW" | "MANUAL_ONLY";

export interface FastSourceCandidate {
  name: string;
  role: SourceRole;
  access: AccessModel;
  status: IntegrationStatus;
  latencyRank: 1 | 2 | 3 | 4 | 5;
  events: string[];
  notes: string;
  url?: string;
}

export interface MarketSourcePlan {
  niche: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  resolutionSources: FastSourceCandidate[];
  fastSignalSources: FastSourceCandidate[];
  oddsReferenceSources: FastSourceCandidate[];
  validationSources: FastSourceCandidate[];
  confirmationPolicy: string[];
  reasons: string[];
}

interface CatalogEntry {
  niche: string;
  patterns: RegExp[];
  resolutionTypes?: ResolutionType[];
  sources: FastSourceCandidate[];
  priority: MarketSourcePlan["priority"];
}

const sportsLiveSources: FastSourceCandidate[] = [
  {
    name: "Sportradar Live Data / Unified Odds Feed",
    role: "FAST_SIGNAL",
    access: "PAID_API",
    status: "NEEDS_KEY",
    latencyRank: 5,
    events: ["goals", "cards", "corners", "penalties", "play-by-play", "clock", "score"],
    notes: "Enterprise-grade live event feed; best candidate for low-latency sports paper trading.",
    url: "https://docs.sportradar.com/live-data/introduction/information-per-sport"
  },
  {
    name: "API-Sports / API-Football family",
    role: "FAST_SIGNAL",
    access: "PAID_API",
    status: "NEEDS_KEY",
    latencyRank: 4,
    events: ["live score", "football events", "basketball events", "lineups", "statistics"],
    notes: "Practical paid API family covering football, basketball and other sports; useful before enterprise feeds.",
    url: "https://www.api-football.com/"
  },
  {
    name: "SofaScore live pages",
    role: "FAST_SIGNAL",
    access: "EXPERIMENTAL",
    status: "NEEDS_TERMS_REVIEW",
    latencyRank: 4,
    events: ["live score", "match incidents", "player stats"],
    notes: "Often fast in practice, but should be treated as experimental unless API access/terms are confirmed.",
    url: "https://www.sofascore.com/"
  },
  {
    name: "TheSportsDB",
    role: "VALIDATION",
    access: "PUBLIC_API",
    status: "READY_TO_INTEGRATE",
    latencyRank: 2,
    events: ["scores", "fixtures", "teams", "standings"],
    notes: "Useful as a cheap secondary validation source, not the primary latency edge source.",
    url: "https://www.thesportsdb.com/documentation"
  }
];

const socialEarlySignal: FastSourceCandidate = {
  name: "X.com / Twitter monitored accounts",
  role: "FAST_SIGNAL",
  access: "EXPERIMENTAL",
  status: "NEEDS_TERMS_REVIEW",
  latencyRank: 5,
  events: ["breaking news", "team news", "official posts", "journalist reports", "rumors"],
  notes: "Use only as early detection. Never promote to paper signal without independent confirmation from official/API/credible source."
};

const newsValidationSources: FastSourceCandidate[] = [
  {
    name: "Official account/site for the entity",
    role: "VALIDATION",
    access: "OFFICIAL_SITE",
    status: "MANUAL_ONLY",
    latencyRank: 4,
    events: ["official announcement", "press release", "statement"],
    notes: "Primary confirmation layer for X/social early signals."
  },
  {
    name: "Reuters/AP/major wire or reputable outlet",
    role: "VALIDATION",
    access: "PAID_API",
    status: "NEEDS_KEY",
    latencyRank: 4,
    events: ["confirmed breaking news", "correction", "follow-up report"],
    notes: "Useful for rejecting fake/speculative social posts before they contaminate paper data."
  }
];

const catalog: CatalogEntry[] = [
  {
    niche: "football",
    patterns: [/football|soccer|fifa|uefa|premier league|la liga|serie a|bundesliga|ligue 1|libertadores|sudamericana|conmebol|cbf|copa|champions league/i],
    resolutionTypes: ["SPORTS_SCORE_PROVIDER"],
    priority: "HIGH",
    sources: [
      {
        name: "Official league/federation site",
        role: "RESOLUTION",
        access: "OFFICIAL_SITE",
        status: "MANUAL_ONLY",
        latencyRank: 2,
        events: ["final score", "official match report", "disciplinary record"],
        notes: "Resolution authority, but not necessarily fastest for live goals/corners/cards."
      },
      socialEarlySignal,
      ...sportsLiveSources
    ]
  },
  {
    niche: "basketball",
    patterns: [/basketball|nba|wnba|ncaa|euroleague|fiba|points|rebounds|assists|three-pointers|3-pointers/i],
    resolutionTypes: ["SPORTS_SCORE_PROVIDER"],
    priority: "HIGH",
    sources: [
      {
        name: "NBA / league official stats",
        role: "RESOLUTION",
        access: "OFFICIAL_SITE",
        status: "MANUAL_ONLY",
        latencyRank: 3,
        events: ["official box score", "play-by-play", "player stats"],
        notes: "Good resolution source for NBA-style markets; live latency must be measured."
      },
      socialEarlySignal,
      ...sportsLiveSources
    ]
  },
  {
    niche: "tennis",
    patterns: [/\btennis\b|\batp\b|\bwta\b|\bgrand slam\b|\bsets?\b|\bbreak point\b|\bserve\b/i],
    resolutionTypes: ["SPORTS_SCORE_PROVIDER"],
    priority: "HIGH",
    sources: [
      {
        name: "ATP/WTA/ITF official live scores",
        role: "RESOLUTION",
        access: "OFFICIAL_SITE",
        status: "MANUAL_ONLY",
        latencyRank: 3,
        events: ["points", "games", "sets", "retirements"],
        notes: "Official scoring source; compare latency against Sportradar/API-Sports style feeds."
      },
      socialEarlySignal,
      ...sportsLiveSources
    ]
  },
  {
    niche: "american_football",
    patterns: [/nfl|college football|touchdown|field goal|yards|quarterback|super bowl/i],
    resolutionTypes: ["SPORTS_SCORE_PROVIDER"],
    priority: "MEDIUM",
    sources: [
      {
        name: "NFL official game center",
        role: "RESOLUTION",
        access: "OFFICIAL_SITE",
        status: "MANUAL_ONLY",
        latencyRank: 3,
        events: ["touchdowns", "field goals", "play-by-play", "clock"],
        notes: "Resolution source; paid feeds may be faster and cleaner."
      },
      socialEarlySignal,
      ...sportsLiveSources
    ]
  },
  {
    niche: "crypto_price",
    patterns: [/\bbtc\b|bitcoin|ethereum|\beth\b|solana|\bsol\b|crypto|binance|coinbase|bybit|kraken/i],
    resolutionTypes: ["EXCHANGE_PRICE", "CHAINLINK_PRICE_FEED"],
    priority: "HIGH",
    sources: [
      {
        name: "Binance WebSocket market streams",
        role: "FAST_SIGNAL",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 5,
        events: ["trades", "ticker", "book ticker", "depth"],
        notes: "Real-time exchange feed; use only when market rules reference a compatible price venue or proxy.",
        url: "https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams"
      },
      socialEarlySignal,
      {
        name: "Coinbase Exchange WebSocket",
        role: "FAST_SIGNAL",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 5,
        events: ["ticker", "matches", "level2"],
        notes: "Useful cross-check against Binance and for Coinbase-referenced markets.",
        url: "https://docs.cdp.coinbase.com/exchange/websocket-feed/overview"
      },
      {
        name: "Chainlink feed / RPC",
        role: "RESOLUTION",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 3,
        events: ["oracle round", "answer", "updatedAt"],
        notes: "Resolution-aligned source for Chainlink markets; not always faster than exchanges."
      }
    ]
  },
  {
    niche: "weather",
    patterns: [/weather|temperature|rain|snow|hurricane|storm|wind|noaa|nws|tornado/i],
    resolutionTypes: ["WEATHER_DATA"],
    priority: "MEDIUM",
    sources: [
      {
        name: "NOAA / National Weather Service API",
        role: "RESOLUTION",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 4,
        events: ["alerts", "observations", "forecasts", "warnings"],
        notes: "Official US weather source with alerts and observations endpoints.",
        url: "https://www.weather.gov/documentation/services-web-api"
      },
      socialEarlySignal,
      ...newsValidationSources,
      {
        name: "Weatherbit severe alerts",
        role: "FAST_SIGNAL",
        access: "PAID_API",
        status: "NEEDS_KEY",
        latencyRank: 3,
        events: ["severe alerts", "onset times"],
        notes: "Secondary feed for alert latency comparison."
      }
    ]
  },
  {
    niche: "economic_release",
    patterns: [/\bcpi\b|\binflation\b|\bunemployment\b|\bjobs report\b|\bpayrolls?\b|\bfomc\b|\bfed\b|\binterest rates?\b|\bgdp\b|\bppi\b|\bbls\b|\bbea\b/i],
    resolutionTypes: ["ECONOMIC_RELEASE"],
    priority: "MEDIUM",
    sources: [
      {
        name: "BLS Public Data API",
        role: "RESOLUTION",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 3,
        events: ["CPI", "jobs", "unemployment", "payroll time series"],
        notes: "Official source for BLS series; release-time latency must be measured.",
        url: "https://www.bls.gov/bls/api_features.htm"
      },
      socialEarlySignal,
      ...newsValidationSources,
      {
        name: "Official agency release page",
        role: "FAST_SIGNAL",
        access: "OFFICIAL_SITE",
        status: "MANUAL_ONLY",
        latencyRank: 4,
        events: ["release headline", "PDF/HTML publication", "embargo release"],
        notes: "For scheduled macro releases, official webpage polling may beat secondary aggregators."
      }
    ]
  },
  {
    niche: "breaking_news_social",
    patterns: [/twitter|x\.com|tweet|post on x|breaking|reported|announcement|resigns|death|arrested|indicted|lawsuit|ban|suspended/i],
    resolutionTypes: ["SOCIAL_MEDIA_POST", "NEWS_EVENT"],
    priority: "MEDIUM",
    sources: [
      socialEarlySignal,
      ...newsValidationSources,
      {
        name: "Market-specific resolution source",
        role: "RESOLUTION",
        access: "MANUAL",
        status: "MANUAL_ONLY",
        latencyRank: 2,
        events: ["final resolution evidence"],
        notes: "Use market rules to decide what source actually resolves the market."
      }
    ]
  },
  {
    niche: "company_filings",
    patterns: [/sec|edgar|earnings|8-k|10-k|10-q|ipo|filing|market cap|spac|merger|acquisition/i],
    priority: "MEDIUM",
    sources: [
      {
        name: "SEC EDGAR APIs",
        role: "RESOLUTION",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 4,
        events: ["filings", "8-K", "S-1", "10-Q", "10-K"],
        notes: "Official filings metadata updates throughout the day; useful for SEC-resolved markets.",
        url: "https://www.sec.gov/edgar/sec-api-documentation"
      },
      {
        name: "Issuer investor relations page",
        role: "FAST_SIGNAL",
        access: "OFFICIAL_SITE",
        status: "MANUAL_ONLY",
        latencyRank: 3,
        events: ["press release", "earnings release", "IPO announcement"],
        notes: "Can appear before/alongside filing data; requires market-specific URL extraction."
      }
    ]
  },
  {
    niche: "aviation",
    patterns: [/flight|airport|airline|faa|delay|cancelled|canceled|arrival|departure/i],
    priority: "MEDIUM",
    sources: [
      {
        name: "FAA NAS Status",
        role: "RESOLUTION",
        access: "OFFICIAL_SITE",
        status: "MANUAL_ONLY",
        latencyRank: 4,
        events: ["airport delays", "ground stops", "closures"],
        notes: "Official US airport delay status; integration needs endpoint confirmation."
      },
      {
        name: "OpenSky Network API",
        role: "FAST_SIGNAL",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 3,
        events: ["aircraft state vectors", "position", "altitude"],
        notes: "Useful for aircraft movement markets; does not provide full live commercial schedule context.",
        url: "https://openskynetwork.github.io/opensky-api/"
      }
    ]
  },
  {
    niche: "earthquake",
    patterns: [/earthquake|magnitude|richter|usgs|seismic|aftershock/i],
    priority: "LOW",
    sources: [
      {
        name: "USGS earthquake feeds/API",
        role: "RESOLUTION",
        access: "PUBLIC_API",
        status: "READY_TO_INTEGRATE",
        latencyRank: 4,
        events: ["earthquake event", "magnitude", "location", "updated magnitude"],
        notes: "Official quantitative earthquake data; website cache can add delay, feeds/API should be monitored.",
        url: "https://www.usgs.gov/tools/earthquake-notifications-feeds-and-web-services"
      }
    ]
  }
];

export function planSourcesForOpportunity(opportunity: Opportunity): MarketSourcePlan {
  return planSourcesForMarket(opportunity.market, opportunity.classification.type);
}

export function planSourcesForMarket(market: MarketSummary, resolutionType?: ResolutionType): MarketSourcePlan {
  const text = [
    market.title,
    market.description,
    market.resolutionRules,
    market.category,
    market.tags.join(" ")
  ].join("\n");

  const matches = catalog
    .map((entry) => ({
      entry,
      patternMatches: entry.patterns.filter((pattern) => pattern.test(text)).length,
      typeMatch: resolutionType && entry.resolutionTypes?.includes(resolutionType) ? 1 : 0
    }))
    .filter((match) => match.patternMatches > 0 || match.typeMatch > 0)
    .sort((a, b) => (b.patternMatches + b.typeMatch) - (a.patternMatches + a.typeMatch));

  const best = matches[0]?.entry;
  if (!best) {
    return {
      niche: "unknown",
      priority: "LOW",
      confidence: 0.1,
      resolutionSources: [],
      fastSignalSources: [],
      oddsReferenceSources: [],
      validationSources: [],
      confirmationPolicy: [
        "Do not create a paper signal from a single unconfirmed social/news source.",
        "Require at least one official source or two independent credible sources before promoting."
      ],
      reasons: ["No fast-source niche matched this market text."]
    };
  }

  const sourceGroups = groupSources(best.sources);
  const confidence = Math.min(0.95, 0.35 + (matches[0].patternMatches * 0.2) + (matches[0].typeMatch * 0.2));
  return {
    niche: best.niche,
    priority: best.priority,
    confidence,
    ...sourceGroups,
    confirmationPolicy: buildConfirmationPolicy(best.niche, sourceGroups.fastSignalSources, sourceGroups.validationSources),
    reasons: [
      `Matched ${best.niche} using ${matches[0].patternMatches} text pattern(s).`,
      resolutionType ? `Current classifier type: ${resolutionType}.` : "No classifier type available."
    ]
  };
}

export function listCatalogEntries(): CatalogEntry[] {
  return catalog;
}

function groupSources(sources: FastSourceCandidate[]) {
  return {
    resolutionSources: sources.filter((source) => source.role === "RESOLUTION"),
    fastSignalSources: sources.filter((source) => source.role === "FAST_SIGNAL"),
    oddsReferenceSources: sources.filter((source) => source.role === "ODDS_REFERENCE"),
    validationSources: sources.filter((source) => source.role === "VALIDATION")
  };
}

function buildConfirmationPolicy(
  niche: string,
  fastSignalSources: FastSourceCandidate[],
  validationSources: FastSourceCandidate[]
): string[] {
  const hasSocial = fastSignalSources.some((source) => source.name.includes("X.com"));
  const policy = [
    "Log first_seen_at for every fast source and confirmed_at for every validation source.",
    "Paper entries must store the source chain used for promotion."
  ];

  if (hasSocial || niche === "breaking_news_social") {
    policy.unshift(
      "X/social posts are early-warning only, not sufficient for a signal.",
      "Promote only after confirmation by an official source or two independent credible non-social sources.",
      "If sources disagree, mark as RUMOR and do not create paper trade."
    );
  }

  if (validationSources.length === 0) {
    policy.push("No validation source configured yet; keep this niche in watch-only mode.");
  }

  return policy;
}
