import { Inject, Injectable } from "@nestjs/common";
import { LOYALTY_REWARD_REPOSITORY, type LoyaltyRewardRepositoryPort } from "../../domain/ports/loyalty-reward-repository.port";
import { RewardCatalogViewService, type RewardView } from "../services/reward-catalog-view.service";

@Injectable()
export class ListLoyaltyRewardsHandler {
  constructor(
    @Inject(LOYALTY_REWARD_REPOSITORY) private readonly rewards: LoyaltyRewardRepositoryPort,
    private readonly catalogView: RewardCatalogViewService
  ) {}

  async execute(filter?: { activeOnly?: boolean }): Promise<RewardView[]> {
    const views = await this.catalogView.viewAll(await this.rewards.list(filter));
    return filter?.activeOnly ? views.filter((r) => r.isActive) : views;
  }
}
