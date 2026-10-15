import { Inject, Module, OnModuleInit } from "@nestjs/common";
import { EventBusService } from "../../shared/events/event-bus.service";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { OrdersModule } from "../orders/orders.module";
import { CustomersModule } from "../customers/customers.module";
import { CatalogModule } from "../catalog/catalog.module";
import { SettingsModule } from "../settings/settings.module";
import type { OrderStatusChangedEvent } from "../orders/domain/events/order-status-changed.event";
import type { OrderCancelledEvent } from "../orders/domain/events/order-cancelled.event";
import { LOYALTY_REWARD_REPOSITORY } from "./domain/ports/loyalty-reward-repository.port";
import { LOYALTY_LEDGER, type LoyaltyLedgerPort } from "./domain/ports/loyalty-ledger.port";
import { LoyaltyRewardRepository } from "./infrastructure/persistence/loyalty-reward.repository";
import { LoyaltyLedger } from "./infrastructure/persistence/loyalty-ledger";
import { RewardCatalogViewService } from "./application/services/reward-catalog-view.service";
import { LoyaltyRedemptionService } from "./application/services/loyalty-redemption.service";
import { AwardPointsForCompletedOrderHandler } from "./application/commands/award-points-for-completed-order.handler";
import { SaveLoyaltyRewardHandler } from "./application/commands/save-loyalty-reward.handler";
import { ListLoyaltyRewardsHandler } from "./application/queries/list-loyalty-rewards.handler";
import { GetCustomerLoyaltyHandler } from "./application/queries/get-customer-loyalty.handler";
import { CustomerLoyaltyController, LoyaltyRewardsController } from "./api/loyalty.controller";

// Loyalty (STORE-2) - نقاط الولاء: كسب بنسبة من إجمالي الطلب بعد التسليم، وصرف في كتالوج مكافآت
// (خصم / صنف هدية / عرض هدية) وقت الطلب أونلاين. سجل حركات + رصيد على customers.loyalty_points
@Module({
  imports: [IdentityAccessModule, OrdersModule, CustomersModule, CatalogModule, SettingsModule],
  controllers: [LoyaltyRewardsController, CustomerLoyaltyController],
  providers: [
    { provide: LOYALTY_REWARD_REPOSITORY, useClass: LoyaltyRewardRepository },
    { provide: LOYALTY_LEDGER, useClass: LoyaltyLedger },
    RewardCatalogViewService,
    LoyaltyRedemptionService,
    AwardPointsForCompletedOrderHandler,
    SaveLoyaltyRewardHandler,
    ListLoyaltyRewardsHandler,
    GetCustomerLoyaltyHandler,
  ],
  exports: [LoyaltyRedemptionService, ListLoyaltyRewardsHandler],
})
export class LoyaltyModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly awardPoints: AwardPointsForCompletedOrderHandler,
    @Inject(LOYALTY_LEDGER) private readonly ledger: LoyaltyLedgerPort
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<OrderStatusChangedEvent>("OrderStatusChanged", (e) => this.awardPoints.handle(e));
    this.eventBus.subscribe<OrderCancelledEvent>("OrderCancelled", (e) => this.ledger.settleCancelledOrder(e.orderId));
  }
}
