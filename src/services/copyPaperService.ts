import { ClobClient } from "../polymarket/clobClient.js";
import { DataApiClient, LeaderboardCategory, LeaderboardPeriod } from "../polymarket/dataApiClient.js";
import { WalletCopyRepo } from "../storage/walletCopyRepo.js";
import { buildWalletProfile, WalletProfile } from "./walletIntelligence.js";

export interface CopyWatchOptions {
  categories: LeaderboardCategory[];
  period: LeaderboardPeriod;
  leaderboardLimit: number;
  activityLimit: number;
  minScore: number;
  minTradeUsdc: number;
  stake: number;
  maxWorsePrice: number;
  minDelaySeconds: number;
  maxTradeAgeSeconds: number;
}

export interface CopyWatchResult {
  profiles: number;
  observedTrades: number;
  copied: number;
  skipped: number;
  reasons: Record<string, number>;
}

export class CopyPaperService {
  private readonly data = new DataApiClient();
  private readonly clob = new ClobClient();
  private readonly repo = new WalletCopyRepo();

  async runOnce(options: CopyWatchOptions): Promise<CopyWatchResult> {
    const profiles = await this.loadProfiles(options);
    const result: CopyWatchResult = {
      profiles: profiles.length,
      observedTrades: 0,
      copied: 0,
      skipped: 0,
      reasons: {}
    };

    for (const profile of profiles) {
      await this.repo.upsertWallet(profile);
      if (profile.qualityScore < options.minScore || profile.copyRisk === "HIGH") continue;

      for (const trade of profile.activity) {
        if (trade.side !== "BUY") continue;
        if (trade.usdcSize < options.minTradeUsdc) continue;
        if (!trade.asset) continue;

        const ageSeconds = Math.floor(Date.now() / 1000) - trade.timestamp;
        if (ageSeconds < options.minDelaySeconds) continue;
        if (ageSeconds > options.maxTradeAgeSeconds) continue;

        const observed = await this.repo.insertObservedTrade(profile, trade);
        if (!observed) continue;
        result.observedTrades += 1;

        if (await this.repo.hasCopyForObservedTrade(observed.id)) continue;
        const decision = await this.evaluateCopy(profile, observed, options);
        await this.repo.insertCopyPaperTrade(decision);
        if (decision.status === "COPIED") result.copied += 1;
        else result.skipped += 1;
        result.reasons[decision.reason] = (result.reasons[decision.reason] ?? 0) + 1;
      }
    }

    return result;
  }

  private async loadProfiles(options: CopyWatchOptions): Promise<WalletProfile[]> {
    const profiles: WalletProfile[] = [];
    for (const category of options.categories) {
      const leaders = await this.data.leaderboard({
        category,
        timePeriod: options.period,
        orderBy: "PNL",
        limit: options.leaderboardLimit
      });

      for (const trader of leaders) {
        const activity = await this.data.activity({
          user: trader.proxyWallet,
          type: "TRADE",
          limit: options.activityLimit
        });
        profiles.push(buildWalletProfile(category, trader, activity));
      }
    }
    return profiles.sort((a, b) => b.qualityScore - a.qualityScore);
  }

  private async evaluateCopy(
    profile: WalletProfile,
    observed: Awaited<ReturnType<WalletCopyRepo["insertObservedTrade"]>> extends infer T ? NonNullable<T> : never,
    options: CopyWatchOptions
  ) {
    const copiedAt = new Date().toISOString();
    try {
      const quote = await this.clob.getTokenQuote(observed.asset!);
      const copyPrice = quote.bestAsk;
      if (copyPrice === undefined) {
        return {
          observedTradeId: observed.id,
          category: observed.category,
          wallet: observed.wallet,
          userName: observed.userName,
          asset: observed.asset,
          outcome: observed.outcome,
          walletPrice: observed.price,
          stake: options.stake,
          status: "SKIPPED" as const,
          reason: "NO_CURRENT_ASK",
          quoteBid: quote.bestBid,
          quoteAsk: quote.bestAsk,
          quoteSpread: quote.spread,
          slug: observed.slug,
          title: observed.title,
          walletTradeTime: observed.walletTradeTime,
          copiedAt
        };
      }

      const maxAcceptable = Math.min(0.99, observed.price * (1 + options.maxWorsePrice));
      const status = copyPrice <= maxAcceptable ? "COPIED" as const : "SKIPPED" as const;
      const reason = status === "COPIED" ? "PRICE_WITHIN_TOLERANCE" : "PRICE_MOVED_TOO_FAR";
      return {
        observedTradeId: observed.id,
        category: observed.category,
        wallet: observed.wallet,
        userName: observed.userName,
        asset: observed.asset,
        outcome: observed.outcome,
        walletPrice: observed.price,
        copyPrice,
        stake: options.stake,
        status,
        reason,
        quoteBid: quote.bestBid,
        quoteAsk: quote.bestAsk,
        quoteSpread: quote.spread,
        slug: observed.slug,
        title: observed.title,
        walletTradeTime: observed.walletTradeTime,
        copiedAt
      };
    } catch {
      return {
        observedTradeId: observed.id,
        category: observed.category,
        wallet: observed.wallet,
        userName: observed.userName,
        asset: observed.asset,
        outcome: observed.outcome,
        walletPrice: observed.price,
        stake: options.stake,
        status: "SKIPPED" as const,
        reason: "QUOTE_FETCH_FAILED",
        slug: observed.slug,
        title: observed.title,
        walletTradeTime: observed.walletTradeTime,
        copiedAt
      };
    }
  }
}
