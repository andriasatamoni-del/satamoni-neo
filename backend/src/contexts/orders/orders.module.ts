import { Module, OnModuleInit } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { BranchesModule } from "../branches/branches.module";
import { CustomersModule } from "../customers/customers.module";
import { ORDER_REPOSITORY } from "./domain/ports/order-repository.port";
import { ORDER_RATING_REPOSITORY } from "./domain/ports/order-rating-repository.port";
import { OrderRepository } from "./infrastructure/persistence/order.repository";
import { OrderRatingRepository } from "./infrastructure/persistence/order-rating.repository";
import { RegisterOrderHandler } from "./application/commands/register-order.handler";
import { CancelOrderHandler } from "./application/commands/cancel-order.handler";
import { UpdateOrderStatusHandler } from "./application/commands/update-order-status.handler";
import { AdvanceKitchenStatusHandler } from "./application/commands/advance-kitchen-status.handler";
import { SubmitOrderRatingHandler } from "./application/commands/submit-order-rating.handler";
import { ListOrdersHandler } from "./application/queries/list-orders.handler";
import { ListKdsBoardHandler } from "./application/queries/list-kds-board.handler";
import { GetPublicOrderRatingHandler } from "./application/queries/get-public-order-rating.handler";
import { SyncOrderPaymentMethodHandler } from "./application/commands/sync-order-payment-method.handler";
import { EventBusService } from "../../shared/events/event-bus.service";
import type { PaymentAdjustmentApprovedEvent } from "../payment-control/domain/events/payment-adjustment-approved.event";
import { OrdersController } from "./api/orders.controller";
import { OrderRatingsController } from "./api/order-ratings.controller";
import { OrdersLiveController } from "./api/orders-live.controller";
import { OrderLiveFeed } from "./application/services/order-live-feed.service";
import type { OrderRegisteredEvent } from "./domain/events/order-registered.event";
import type { OrderStatusChangedEvent } from "./domain/events/order-status-changed.event";
import type { KitchenStatusAdvancedEvent } from "./domain/events/kitchen-status-advanced.event";
import type { OrderCancelledEvent } from "./domain/events/order-cancelled.event";

@Module({
  imports: [IdentityAccessModule, CatalogModule, InventoryModule, BranchesModule, CustomersModule],
  controllers: [OrdersController, OrderRatingsController, OrdersLiveController],
  providers: [
    OrderLiveFeed,
    { provide: ORDER_REPOSITORY, useClass: OrderRepository },
    { provide: ORDER_RATING_REPOSITORY, useClass: OrderRatingRepository },
    RegisterOrderHandler,
    CancelOrderHandler,
    UpdateOrderStatusHandler,
    AdvanceKitchenStatusHandler,
    SubmitOrderRatingHandler,
    SyncOrderPaymentMethodHandler,
    ListOrdersHandler,
    ListKdsBoardHandler,
    GetPublicOrderRatingHandler,
  ],
  exports: [ORDER_REPOSITORY, RegisterOrderHandler, CancelOrderHandler],
})
export class OrdersModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly syncOrderPaymentMethod: SyncOrderPaymentMethodHandler,
    private readonly liveFeed: OrderLiveFeed
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<PaymentAdjustmentApprovedEvent>("PaymentAdjustmentApproved", (e) => this.syncOrderPaymentMethod.handle(e), { critical: true });
    this.eventBus.subscribe<OrderRegisteredEvent>("OrderRegistered", (e) => this.liveFeed.publish({ change: "registered", orderId: e.orderId, branchId: e.branchId }));
    this.eventBus.subscribe<OrderStatusChangedEvent>("OrderStatusChanged", (e) => this.liveFeed.publish({ change: "status", orderId: e.orderId, branchId: e.branchId }));
    this.eventBus.subscribe<KitchenStatusAdvancedEvent>("KitchenStatusAdvanced", (e) => this.liveFeed.publish({ change: "kitchen", orderId: e.orderId, branchId: e.branchId }));
    this.eventBus.subscribe<OrderCancelledEvent>("OrderCancelled", (e) => this.liveFeed.publish({ change: "cancelled", orderId: e.orderId, branchId: e.branchId }));
  }
}
