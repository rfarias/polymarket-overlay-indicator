export type ResolutionType =
  | "CHAINLINK_PRICE_FEED"
  | "EXCHANGE_PRICE"
  | "OFFICIAL_WEBSITE"
  | "SPORTS_SCORE_PROVIDER"
  | "WEATHER_DATA"
  | "ECONOMIC_RELEASE"
  | "SOCIAL_MEDIA_POST"
  | "NEWS_EVENT"
  | "MANUAL_AMBIGUOUS"
  | "UNKNOWN";

export type Suggestion = "WATCH" | "ALERT" | "TRADE_CANDIDATE" | "AVOID";

export interface MarketSummary {
  eventId: string;
  marketId: string;
  slug: string;
  title: string;
  description: string;
  resolutionRules: string;
  endDate?: string;
  category?: string;
  tags: string[];
  volume: number;
  liquidity: number;
  outcomes: string[];
  tokenIds: string[];
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  raw: unknown;
}

export interface ResolutionClassification {
  type: ResolutionType;
  sources: string[];
  confidence: number;
  ambiguityRisk: number;
  reason: string;
}

export interface OrderBookSnapshot {
  marketId: string;
  yesTokenId?: string;
  noTokenId?: string;
  bestYesBid?: number;
  bestYesAsk?: number;
  bestNoBid?: number;
  bestNoAsk?: number;
  spread?: number;
  topLiquidity?: number;
  depthToFiveTicks?: number;
  updatedAt: string;
}

export interface SourceState {
  adapter: string;
  observedAt: string;
  value?: number;
  target?: number;
  direction?: "UP" | "DOWN" | "ABOVE" | "BELOW";
  stale: boolean;
  details: Record<string, unknown>;
}

export interface ProbabilityEstimate {
  fairYes: number;
  confidence: number;
  sourceRisk: number;
  latencyRisk: number;
  resolutionRisk: number;
  reason: string;
}

export interface Opportunity {
  market: MarketSummary;
  classification: ResolutionClassification;
  sourceState?: SourceState;
  estimate?: ProbabilityEstimate;
  orderBook: OrderBookSnapshot;
  fairYes?: number;
  fairNo?: number;
  edgeBuyYes?: number;
  edgeBuyNo?: number;
  edgeSellYes?: number;
  edgeSellNo?: number;
  netEdge?: number;
  confidence: number;
  risk: number;
  suggestion: Suggestion;
  reasons: string[];
  createdAt: string;
}

export interface Adapter {
  name: string;
  canHandle(market: MarketSummary, classification: ResolutionClassification): boolean;
  fetchCurrentState(market: MarketSummary): Promise<SourceState>;
  estimateProbability(market: MarketSummary, sourceState: SourceState): Promise<ProbabilityEstimate>;
  getConfidence(): number;
  getLatencyInfo(): string;
  getResolutionRisk(): number;
}
