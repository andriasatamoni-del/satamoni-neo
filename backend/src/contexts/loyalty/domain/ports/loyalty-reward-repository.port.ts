import type { LoyaltyReward } from "../loyalty-reward.aggregate";

export interface LoyaltyRewardRepositoryPort {
  save(reward: LoyaltyReward): Promise<void>;
  findById(id: string): Promise<LoyaltyReward | null>;
  list(filter?: { activeOnly?: boolean }): Promise<LoyaltyReward[]>;
}

export const LOYALTY_REWARD_REPOSITORY = Symbol("LOYALTY_REWARD_REPOSITORY");
