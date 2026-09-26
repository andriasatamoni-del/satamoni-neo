import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما طلب يتلغى (CancelOrderHandler) - مستهلك أساسي: Accounting (عكس قيد البيع التلقائي، راجع
// PostOrderCancellationJournalEntryHandler). نفس فلسفة OrderRegisteredEvent بالظبط - الناشر مايعرفش
// حد مستهلكينه.
export class OrderCancelledEvent extends DomainEvent {
  readonly eventName = "OrderCancelled";

  constructor(
    public readonly orderId: string,
    public readonly branchId: string,
    public readonly total: number,
    public readonly cancelledBy: string | null
  ) {
    super();
  }
}
