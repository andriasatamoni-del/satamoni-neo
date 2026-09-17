import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { OrderNotFoundError } from "../../domain/errors";

export interface AdvanceKitchenStatusCommand {
  orderId: string;
  kitchenStatus: string;
}

@Injectable()
export class AdvanceKitchenStatusHandler {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}

  async execute(command: AdvanceKitchenStatusCommand): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new OrderNotFoundError();

    order.advanceKitchenStatus(command.kitchenStatus);
    await this.orders.save(order);
    return order;
  }
}
