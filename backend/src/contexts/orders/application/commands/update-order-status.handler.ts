import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { OrderNotFoundError } from "../../domain/errors";

export interface UpdateOrderStatusCommand {
  orderId: string;
  status?: string;
  kitchenStatus?: string;
}

@Injectable()
export class UpdateOrderStatusHandler {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}

  async execute(command: UpdateOrderStatusCommand): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new OrderNotFoundError();

    if (command.status !== undefined) order.setStatus(command.status);
    if (command.kitchenStatus !== undefined) order.setKitchenStatus(command.kitchenStatus);

    await this.orders.save(order);
    return order;
  }
}
