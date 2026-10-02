import { Inject, Injectable } from "@nestjs/common";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../domain/ports/order-repository.port";
import type { PaymentAdjustmentApprovedEvent } from "../../../payment-control/domain/events/payment-adjustment-approved.event";

// BL-06: an approved payment adjustment that changes the payment METHOD must not leave orders.payment_method_id pointing at the old
// method (the order list/report and the payment record would disagree). Runs in the adjustment's transaction (critical subscriber).
// The order TOTAL is never touched: the sale value is a fact; only the recorded payment is corrected (see the accounting handler).
@Injectable()
export class SyncOrderPaymentMethodHandler {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}

  async handle(event: PaymentAdjustmentApprovedEvent): Promise<void> {
    if (event.newPaymentMethodId === event.previousPaymentMethodId) return;
    await this.orders.updatePaymentMethod(event.orderId, event.newPaymentMethodId);
  }
}
