import { Module, OnModuleInit } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { SettingsModule } from "../settings/settings.module";
import { EventBusService } from "../../shared/events/event-bus.service";
import type { OrderRegisteredEvent } from "../orders/domain/events/order-registered.event";
import type { OrderStatusChangedEvent } from "../orders/domain/events/order-status-changed.event";
import type { KitchenStatusAdvancedEvent } from "../orders/domain/events/kitchen-status-advanced.event";
import { SMS_GATEWAY } from "./domain/ports/sms-gateway.port";
import { ORDER_NOTIFICATION_STORE } from "./domain/ports/order-notification-store.port";
import { WebhookSmsGateway } from "./infrastructure/sms/webhook-sms.gateway";
import { KyselyOrderNotificationStore } from "./infrastructure/persistence/kysely-order-notification.store";
import { OrderNotificationsService } from "./application/order-notifications.service";
import { OrderNotificationsController } from "./api/order-notifications.controller";

// رسايل العميل التلقائية (SMS) - مستهلك أحداث Orders بس، مفيش context تاني بيعتمد عليه
@Module({
  imports: [IdentityAccessModule, SettingsModule],
  controllers: [OrderNotificationsController],
  providers: [
    { provide: SMS_GATEWAY, useClass: WebhookSmsGateway },
    { provide: ORDER_NOTIFICATION_STORE, useClass: KyselyOrderNotificationStore },
    OrderNotificationsService,
  ],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly notifications: OrderNotificationsService
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<OrderRegisteredEvent>("OrderRegistered", (e) => this.notifications.onOrderRegistered(e.orderId));
    this.eventBus.subscribe<OrderStatusChangedEvent>("OrderStatusChanged", async (e) => {
      if (e.orderType === "delivery" && e.status === "completed") await this.notifications.onOrderDelivered(e.orderId);
    });
    this.eventBus.subscribe<KitchenStatusAdvancedEvent>("KitchenStatusAdvanced", async (e) => {
      if (e.orderType === "takeaway" && e.kitchenStatus === "READY") await this.notifications.onOrderDelivered(e.orderId);
    });
  }
}
