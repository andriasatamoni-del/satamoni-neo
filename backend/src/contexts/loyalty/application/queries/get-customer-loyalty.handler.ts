import { Inject, Injectable } from "@nestjs/common";
import type { Customer } from "../../../customers/domain/customer.aggregate";
import { GetPosSettingsHandler } from "../../../settings/application/queries/get-pos-settings.handler";
import { LOYALTY_LEDGER, type LoyaltyLedgerPort } from "../../domain/ports/loyalty-ledger.port";
import { LOYALTY_REWARD_REPOSITORY, type LoyaltyRewardRepositoryPort } from "../../domain/ports/loyalty-reward-repository.port";
import { RewardCatalogViewService } from "../services/reward-catalog-view.service";

// "نقاطي": الرصيد + آخر الحركات + المكافآت المتاحة (ومين فيهم الرصيد يكفيها)
@Injectable()
export class GetCustomerLoyaltyHandler {
  constructor(
    @Inject(LOYALTY_LEDGER) private readonly ledger: LoyaltyLedgerPort,
    @Inject(LOYALTY_REWARD_REPOSITORY) private readonly rewards: LoyaltyRewardRepositoryPort,
    private readonly catalogView: RewardCatalogViewService,
    private readonly settings: GetPosSettingsHandler
  ) {}

  async execute(customer: Customer) {
    const [balance, history, rewards, settings] = await Promise.all([
      this.ledger.balance(customer.id),
      this.ledger.history(customer.id, 30),
      this.rewards.list({ activeOnly: true }),
      this.settings.execute(),
    ]);
    const views = (await this.catalogView.viewAll(rewards)).filter((r) => r.isActive);
    return {
      balance,
      pointsPerEgp: settings.loyaltyPointsPerEgp,
      history,
      rewards: views.map((r) => ({ ...r, affordable: balance >= r.pointsCost })),
    };
  }
}
