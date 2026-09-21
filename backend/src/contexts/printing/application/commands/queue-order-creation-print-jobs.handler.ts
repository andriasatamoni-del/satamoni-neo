import { Injectable, Logger } from "@nestjs/common";
import { OrderPrintDataBuilder } from "../services/order-print-data.builder";
import { PrintJobQueuer } from "../services/print-job-queuer.service";
import { KitchenTicketDispatcher } from "../services/kitchen-ticket-dispatcher.service";
import { buildCustomerReceipt, buildKitchenSummary, buildDeliverySummary } from "../../infrastructure/print-templates";
import type { OrderRegisteredEvent } from "../../../orders/domain/events/order-registered.event";

// تيك أواي/دليفري - عند إنشاء الطلب فورًا (نفس لحظة تأكيد الطلب، راجع db/print-queue.js:
// queueOrderCreationPrintJobs). صالة: مفيش طباعة عند الإنشاء خالص - تذاكر المطبخ بتتطبع لما المطبخ
// يقدّم الطلب لـPREPARING فعليًا (QueueDineinPreparingPrintJobsHandler)، والفاتورة بطلب الجرسون
// (QueueDineinBillPrintJobHandler)
@Injectable()
export class QueueOrderCreationPrintJobsHandler {
  private readonly logger = new Logger(QueueOrderCreationPrintJobsHandler.name);

  constructor(
    private readonly orderPrintData: OrderPrintDataBuilder,
    private readonly printJobQueuer: PrintJobQueuer,
    private readonly kitchenTicketDispatcher: KitchenTicketDispatcher
  ) {}

  async handle(event: OrderRegisteredEvent): Promise<void> {
    const data = await this.orderPrintData.build(event.orderId);
    if (!data) {
      this.logger.warn(`تخطّي طباعة الطلب ${event.orderId} - الطلب مش موجود`);
      return;
    }
    const { order, summary, items } = data;

    if (order.orderType === "takeaway") {
      await this.printJobQueuer.queueForType({
        orderId: order.id, branchId: order.branchId, printType: "CUSTOMER_RECEIPT", printerType: "CASHIER",
        contentHtml: buildCustomerReceipt({ order: summary, items }),
        idempotencyKey: `order:${order.id}:type:CUSTOMER_RECEIPT`, createdBy: order.createdBy,
      });
      await this.printJobQueuer.queueForType({
        orderId: order.id, branchId: order.branchId, printType: "KITCHEN_SUMMARY", printerType: "KITCHEN",
        contentHtml: buildKitchenSummary({ order: summary, items }),
        idempotencyKey: `order:${order.id}:type:KITCHEN_SUMMARY`, createdBy: order.createdBy,
      });
      await this.kitchenTicketDispatcher.dispatch({ orderId: order.id, branchId: order.branchId, order: summary, items, createdBy: order.createdBy });
    } else if (order.orderType === "delivery") {
      await this.printJobQueuer.queueForType({
        orderId: order.id, branchId: order.branchId, printType: "DELIVERY_SUMMARY", printerType: "DELIVERY",
        contentHtml: buildDeliverySummary({ order: summary, items }),
        idempotencyKey: `order:${order.id}:type:DELIVERY_SUMMARY`, createdBy: order.createdBy,
      });
      await this.kitchenTicketDispatcher.dispatch({ orderId: order.id, branchId: order.branchId, order: summary, items, createdBy: order.createdBy });
    }
  }
}
