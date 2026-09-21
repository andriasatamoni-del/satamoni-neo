import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { OrderNotFoundError } from "../../domain/errors";
import { KitchenStatusAdvancedEvent } from "../../domain/events/kitchen-status-advanced.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";

export interface AdvanceKitchenStatusCommand {
  orderId: string;
  kitchenStatus: string;
}

@Injectable()
export class AdvanceKitchenStatusHandler {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: AdvanceKitchenStatusCommand): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new OrderNotFoundError();

    order.advanceKitchenStatus(command.kitchenStatus);
    await this.orders.save(order);

    // فشل مستهلك تاني (زي طباعة تذاكر مطبخ) مايرجّعش تقديم حالة التحضير نفسه فاشل - راجع
    // EventBusService.publish
    await this.eventBus.publish(new KitchenStatusAdvancedEvent(order.id, order.branchId, order.orderType, order.kitchenStatus));
    return order;
  }
}
