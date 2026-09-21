import { Injectable } from "@nestjs/common";
import { OrderPrintDataBuilder } from "../services/order-print-data.builder";
import { PrintJobQueuer } from "../services/print-job-queuer.service";
import { buildDeliveryFinalReceipt } from "../../infrastructure/print-templates";
import { OrderNotFoundError } from "../../../orders/domain/errors";
import type { PrintJob } from "../../domain/print-job.aggregate";

export interface QueueDeliveryHandoverPrintJobCommand {
  orderId: string;
  createdBy?: string | null;
}

// دليفري - وقت تسليم الطلب فعليًا للسائق (dispatch_status -> OUT_FOR_DELIVERY) - إيصال نهائي فيه سعر هو
// اللي هيتسلّم للعميل لحظة التوصيل. إجراء يدوي عمدًا (بينادى من واجهة التوصيل وقت تسجيل التسليم)، مش
// حدث تلقائي - نفس فلسفة db/print-queue.js: queueDeliveryHandoverPrintJobs بالظبط
@Injectable()
export class QueueDeliveryHandoverPrintJobHandler {
  constructor(
    private readonly orderPrintData: OrderPrintDataBuilder,
    private readonly printJobQueuer: PrintJobQueuer
  ) {}

  async execute(command: QueueDeliveryHandoverPrintJobCommand): Promise<PrintJob> {
    const data = await this.orderPrintData.build(command.orderId);
    if (!data) throw new OrderNotFoundError();
    const { order, summary, items } = data;

    return this.printJobQueuer.queueForType({
      orderId: order.id, branchId: order.branchId, printType: "DELIVERY_FINAL_RECEIPT", printerType: "DELIVERY",
      contentHtml: buildDeliveryFinalReceipt({ order: summary, items }),
      idempotencyKey: `order:${order.id}:type:DELIVERY_FINAL_RECEIPT`, createdBy: command.createdBy,
    });
  }
}
