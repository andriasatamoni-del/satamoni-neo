import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما شيفت يتقفل نهائيًا (مباشرة CLOSED، أو بعد مراجعة PENDING_REVIEW) - مستهلك حالي: Accounting
// (تصفية قيد فرق الكاش لو موجود). variance=0 يعني مفيش فرق يتترحّل خالص
export class ShiftClosedEvent extends DomainEvent {
  readonly eventName = "ShiftClosed";

  constructor(
    public readonly shiftId: string,
    public readonly branchId: string,
    public readonly cashVariance: number,
    public readonly closedBy: string
  ) {
    super();
  }
}
