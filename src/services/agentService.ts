import { ChainlinkBtcAdapter } from "../adapters/chainlinkBtcAdapter.js";
import { ExchangePriceAdapter } from "../adapters/exchangePriceAdapter.js";
import { OfficialWebsiteAdapter } from "../adapters/officialWebsiteAdapter.js";
import { ResolutionClassifier } from "../classifiers/resolutionClassifier.js";
import { AnomalyDetector } from "../engine/anomalyDetector.js";
import { FairValueEngine } from "../engine/fairValueEngine.js";
import { RiskEngine } from "../engine/riskEngine.js";
import { GammaClient } from "../polymarket/gammaClient.js";
import { ClobClient } from "../polymarket/clobClient.js";
import { PaperTrader } from "../paper/paperTrader.js";
import { SnapshotsRepo } from "../storage/snapshotsRepo.js";
import { Opportunity } from "../types.js";
import { filterLatencyUniverse } from "./latencyUniverse.js";

export interface ScanOptions {
  universe?: "all" | "latency";
  limit?: number;
  maxPages?: number;
}

export class AgentService {
  private readonly gamma = new GammaClient();
  private readonly detector = new AnomalyDetector(
    new ResolutionClassifier(),
    new ClobClient(),
    [new ChainlinkBtcAdapter(), new ExchangePriceAdapter(), new OfficialWebsiteAdapter()],
    new FairValueEngine(),
    new RiskEngine()
  );
  private readonly repo = new SnapshotsRepo();
  private readonly paperTrader = new PaperTrader();

  async scan(options: ScanOptions = {}): Promise<Opportunity[]> {
    const markets = await this.gamma.fetchActiveEvents(options.limit, options.maxPages);
    const selectedMarkets = options.universe === "latency"
      ? filterLatencyUniverse(markets).map((item) => item.market)
      : markets;
    const opportunities: Opportunity[] = [];
    const batchSize = 6;

    for (let index = 0; index < selectedMarkets.length; index += batchSize) {
      const batch = selectedMarkets.slice(index, index + batchSize);
      const analyzed = await Promise.all(
        batch.map(async (market) => {
          try {
            return await this.detector.analyzeMarket(market);
          } catch (error) {
            console.error(`Failed to analyze ${market.slug || market.marketId}:`, error);
            return undefined;
          }
        })
      );

      for (const opportunity of analyzed) {
        if (!opportunity) continue;
        opportunities.push(opportunity);
        await this.repo.saveOpportunity(opportunity);
        const trade = this.paperTrader.maybeCreateTrade(opportunity);
        if (trade && !(await this.repo.hasOpenPaperTrade(trade.marketId, trade.side))) {
          await this.repo.savePaperTrade(trade);
        }
      }
    }

    return opportunities.sort((a, b) => (b.netEdge ?? -1) - (a.netEdge ?? -1));
  }

  async latest(limit = 100): Promise<Opportunity[]> {
    return this.repo.listLatestOpportunities(limit);
  }

  repoInstance(): SnapshotsRepo {
    return this.repo;
  }
}
