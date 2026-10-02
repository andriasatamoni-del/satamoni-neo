import { DomainEvent } from "../../../../shared/events/domain-event";

// BL-06: an approved payment adjustment changed the recorded payment (amount and/or method). Consumers (critical, same
// transaction): Orders keeps orders.payment_method_id in sync with the payment; Accounting posts the correcting journal for an
// amount change. The original sale journal and the original payment evidence (previous* values) are never overwritten.
export class PaymentAdjustmentApprovedEvent extends DomainEvent {
  readonly eventName = "PaymentAdjustmentApproved";

  constructor(
    public readonly requestId: string,
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly branchId: string,
    public readonly previousAmount: number,
    public readonly newAmount: number,
    public readonly previousPaymentMethodId: string,
    public readonly newPaymentMethodId: string,
    public readonly approvedBy: string | null
  ) {
    super();
  }
}
