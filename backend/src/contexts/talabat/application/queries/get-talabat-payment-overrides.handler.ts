import { Inject, Injectable } from "@nestjs/common";
import { TALABAT_ORDER_REPOSITORY, type TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";
import {
  PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY,
  type PaymentAdjustmentRequestRepositoryPort,
} from "../../../payment-control/domain/ports/payment-adjustment-request-repository.port";
import { PAYMENT_REPOSITORY, type PaymentRepositoryPort } from "../../../payment-control/domain/ports/payment-repository.port";

export interface TalabatPaymentOverrideRow {
  talabatOrderId: string;
  posOrderId: string;
  adjustmentRequestId: string;
  status: string;
  amountDelta: number;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
}

// "Talabat Payment Control" - أي محاولة تعديل دفعة أوردر مصدره Talabat (نفس مفهوم
// GET /api/payment-control/talabat-payment-overrides بالريبو القديم بالظبط) - تقرير قراءة بس، مفيش
// منطق دومين جديد هنا (القرار الفعلي - talabat.payment_override permission - بيتفحص في
// ApprovePaymentAdjustmentHandler عبر الـcontroller، راجع talabat.controller.ts)
@Injectable()
export class GetTalabatPaymentOverridesHandler {
  constructor(
    @Inject(TALABAT_ORDER_REPOSITORY) private readonly talabatOrders: TalabatOrderRepositoryPort,
    @Inject(PAYMENT_ADJUSTMENT_REQUEST_REPOSITORY) private readonly adjustmentRequests: PaymentAdjustmentRequestRepositoryPort,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort
  ) {}

  async execute(): Promise<TalabatPaymentOverrideRow[]> {
    const importedOrders = (await this.talabatOrders.list({ status: "IMPORTED" })).filter((o) => o.posOrderId);
    if (importedOrders.length === 0) return [];

    const talabatByPosOrderId = new Map(importedOrders.map((o) => [o.posOrderId as string, o.talabatOrderId]));
    const allRequests = await this.adjustmentRequests.list();

    const rows: TalabatPaymentOverrideRow[] = [];
    for (const request of allRequests) {
      const payment = await this.payments.findById(request.paymentId);
      if (!payment) continue;
      const talabatOrderId = talabatByPosOrderId.get(payment.orderId);
      if (!talabatOrderId) continue;

      rows.push({
        talabatOrderId,
        posOrderId: payment.orderId,
        adjustmentRequestId: request.id,
        status: request.status,
        amountDelta: request.amountDelta,
        requestedBy: request.requestedBy,
        decidedBy: request.decidedBy,
        decidedAt: request.decidedAt,
      });
    }
    return rows;
  }
}
