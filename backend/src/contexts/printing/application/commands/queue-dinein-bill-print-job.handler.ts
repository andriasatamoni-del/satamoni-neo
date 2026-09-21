import { Injectable } from "@nestjs/common";
import { OrderPrintDataBuilder } from "../services/order-print-data.builder";
import { PrintJobQueuer } from "../services/print-job-queuer.service";
import { buildDineInBill } from "../../infrastructure/print-templates";
import { OrderNotFoundError } from "../../../orders/domain/errors";
import type { PrintJob } from "../../domain/print-job.aggregate";

export interface QueueDineinBillPrintJobCommand {
  orderId: string;
  createdBy?: string | null;
}

// صالة - فاتورة بطلب الجرسون، أي وقت قبل التحصيل. مفتاح idempotency ثابت لكل طلب (من غير أي جزء متغيّر
// زي وقت الطلب) عمدًا - أي ضغطة تانية على الزرار قبل ما الطلب يتلغي/يتقفل بترجع نفس صف print_jobs
// الموجود بدل ما تنشئ واحد جديد (نفس فلسفة db/print-queue.js: queueDineInBillPrintJob بالظبط)
@Injectable()
export class QueueDineinBillPrintJobHandler {
  constructor(
    private readonly orderPrintData: OrderPrintDataBuilder,
    private readonly printJobQueuer: PrintJobQueuer
  ) {}

  async execute(command: QueueDineinBillPrintJobCommand): Promise<PrintJob> {
    const data = await this.orderPrintData.build(command.orderId);
    if (!data) throw new OrderNotFoundError();
    const { order, summary, items } = data;

    return this.printJobQueuer.queueForType({
      orderId: order.id, branchId: order.branchId, printType: "DINE_IN_BILL", printerType: "CASHIER",
      contentHtml: buildDineInBill({ order: summary, items }),
      idempotencyKey: `order:${order.id}:type:DINE_IN_BILL`, createdBy: command.createdBy,
    });
  }
}
