import { Inject, Injectable } from "@nestjs/common";
import { Order } from "../../domain/order.aggregate";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import { OrderNotFoundError, CancelledStatusRequiresDedicatedEndpointError } from "../../domain/errors";

export interface UpdateOrderStatusCommand {
  orderId: string;
  status?: string;
}

// عمدًا مش بيقبل status="cancelled" هنا - إلغاء حقيقي لازم يعكس استهلاك المخزون + القيد المحاسبي
// (راجع CancelOrderHandler)، وده مسار تحديث حالة عام بسيط بس (setStatus بدون أي أثر جانبي على سياقات
// تانية). لو اتسمح بيه هنا، الطلب هيتقفل status=cancelled من غير أي عكس فعلي - فرق تكلفة صامت وخطير
@Injectable()
export class UpdateOrderStatusHandler {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}

  async execute(command: UpdateOrderStatusCommand): Promise<Order> {
    if (command.status === "cancelled") throw new CancelledStatusRequiresDedicatedEndpointError();

    const order = await this.orders.findById(command.orderId);
    if (!order) throw new OrderNotFoundError();

    if (command.status !== undefined) order.setStatus(command.status);

    await this.orders.save(order);
    return order;
  }
}
