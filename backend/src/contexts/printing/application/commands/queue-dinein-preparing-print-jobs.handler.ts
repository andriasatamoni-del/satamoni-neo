import { Injectable, Logger } from "@nestjs/common";
import { OrderPrintDataBuilder } from "../services/order-print-data.builder";
import { KitchenTicketDispatcher } from "../services/kitchen-ticket-dispatcher.service";
import type { KitchenStatusAdvancedEvent } from "../../../orders/domain/events/kitchen-status-advanced.event";

// صالة - وقت ما المطبخ يقدّم حالة الطلب لـPREPARING (مطابقة صريحة لـdb/print-queue.js:
// queueDineInPreparingPrintJobs): تذاكر مطبخ بس، من غير ملخص أو إيصال
@Injectable()
export class QueueDineinPreparingPrintJobsHandler {
  private readonly logger = new Logger(QueueDineinPreparingPrintJobsHandler.name);

  constructor(
    private readonly orderPrintData: OrderPrintDataBuilder,
    private readonly kitchenTicketDispatcher: KitchenTicketDispatcher
  ) {}

  async handle(event: KitchenStatusAdvancedEvent): Promise<void> {
    if (event.orderType !== "dinein" || event.kitchenStatus !== "PREPARING") return;

    const data = await this.orderPrintData.build(event.orderId);
    if (!data) {
      this.logger.warn(`تخطّي طباعة تذاكر مطبخ الصالة للطلب ${event.orderId} - الطلب مش موجود`);
      return;
    }
    const { order, summary, items } = data;
    await this.kitchenTicketDispatcher.dispatch({ orderId: order.id, branchId: order.branchId, order: summary, items, createdBy: order.createdBy });
  }
}
