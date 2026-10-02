import { Inject, Injectable } from "@nestjs/common";
import { LOYALTY_REWARD_REPOSITORY, type LoyaltyRewardRepositoryPort } from "../../domain/ports/loyalty-reward-repository.port";
import { LOYALTY_LEDGER, type LoyaltyLedgerPort } from "../../domain/ports/loyalty-ledger.port";
import { InsufficientLoyaltyPointsError, LoyaltyRewardNotFoundError } from "../../domain/errors";
import { RewardCatalogViewService } from "./reward-catalog-view.service";

export interface PreparedRedemption {
  rewardId: string;
  rewardName: string;
  pointsCost: number;
  // سطر الهدية اللي بيتضاف للطلب (صنف أو عرض) - null لمكافأة الخصم
  giftLine: { variantId?: string; comboId?: string; quantity: 1 } | null;
  // الخصم على الطلب: مبلغ الخصم، أو سعر الهدية بالمنيو (فالهدية بتطلع ببلاش والمخزون بيتسحب عادي)
  discount: number;
}

// صرف النقاط وقت الطلب أونلاين: prepare (تحقق + حساب) ← reserve قبل تسجيل الطلب ← attach بعد نجاحه، أو
// release لو فشل. الحجز قبل التسجيل عشان طلبين في نفس اللحظة مايصرفوش نفس النقاط مرتين
@Injectable()
export class LoyaltyRedemptionService {
  constructor(
    @Inject(LOYALTY_REWARD_REPOSITORY) private readonly rewards: LoyaltyRewardRepositoryPort,
    @Inject(LOYALTY_LEDGER) private readonly ledger: LoyaltyLedgerPort,
    private readonly catalogView: RewardCatalogViewService
  ) {}

  async prepare(customerId: string, rewardId: string): Promise<PreparedRedemption> {
    const reward = await this.rewards.findById(rewardId);
    if (!reward) throw new LoyaltyRewardNotFoundError();
    const view = await this.catalogView.view(reward);
    if (!view.isActive || view.value === null) throw new LoyaltyRewardNotFoundError();
    const balance = await this.ledger.balance(customerId);
    if (balance < reward.pointsCost) throw new InsufficientLoyaltyPointsError(reward.pointsCost, balance);

    return {
      rewardId: reward.id,
      rewardName: reward.name,
      pointsCost: reward.pointsCost,
      giftLine: reward.variantId
        ? { variantId: reward.variantId, quantity: 1 }
        : reward.comboId
          ? { comboId: reward.comboId, quantity: 1 }
          : null,
      discount: view.value,
    };
  }

  reserve(customerId: string, requestId: string, redemption: PreparedRedemption): Promise<void> {
    return this.ledger.reserveRedemption({
      customerId,
      requestId,
      rewardId: redemption.rewardId,
      points: redemption.pointsCost,
      note: redemption.rewardName,
    });
  }

  attach(requestId: string, orderId: string): Promise<void> {
    return this.ledger.attachReservationToOrder(requestId, orderId);
  }

  release(requestId: string): Promise<void> {
    return this.ledger.releaseReservation(requestId);
  }
}
