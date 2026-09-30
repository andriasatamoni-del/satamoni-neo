import { Inject, Injectable } from "@nestjs/common";
import { LoyaltyReward, type LoyaltyRewardInput } from "../../domain/loyalty-reward.aggregate";
import { LOYALTY_REWARD_REPOSITORY, type LoyaltyRewardRepositoryPort } from "../../domain/ports/loyalty-reward-repository.port";
import { InvalidLoyaltyRewardError, LoyaltyRewardNotFoundError } from "../../domain/errors";
import { RewardCatalogViewService, type RewardView } from "../services/reward-catalog-view.service";

@Injectable()
export class SaveLoyaltyRewardHandler {
  constructor(
    @Inject(LOYALTY_REWARD_REPOSITORY) private readonly rewards: LoyaltyRewardRepositoryPort,
    private readonly catalogView: RewardCatalogViewService
  ) {}

  async create(input: LoyaltyRewardInput): Promise<RewardView> {
    const reward = LoyaltyReward.register(input);
    await this.ensureTargetExists(reward);
    await this.rewards.save(reward);
    return this.catalogView.view(reward);
  }

  async update(id: string, input: LoyaltyRewardInput): Promise<RewardView> {
    const reward = await this.rewards.findById(id);
    if (!reward) throw new LoyaltyRewardNotFoundError();
    reward.update(input);
    await this.ensureTargetExists(reward);
    await this.rewards.save(reward);
    return this.catalogView.view(reward);
  }

  private async ensureTargetExists(reward: LoyaltyReward): Promise<void> {
    if (reward.kind === "discount") return;
    if ((await this.catalogView.view(reward)).value === null) throw new InvalidLoyaltyRewardError("الصنف أو العرض الهدية مش موجود");
  }
}
