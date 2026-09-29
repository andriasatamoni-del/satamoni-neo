import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما حالة الطلب تتغيّر من مسار التحديث العام (preparing -> out_for_delivery -> completed). أول
// مستهلك: Notifications (طلب التقييم بعد تسليم الدليفري)
export class OrderStatusChangedEvent extends DomainEvent {
  readonly eventName = "OrderStatusChanged";

  constructor(
    public readonly orderId: string,
    public readonly branchId: string,
    public readonly orderType: string,
    public readonly previousStatus: string,
    public readonly status: string
  ) {
    super();
  }
}
