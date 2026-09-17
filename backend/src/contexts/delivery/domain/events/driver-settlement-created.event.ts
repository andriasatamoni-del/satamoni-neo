import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما تسوية كاش سائق تتسجّل - مستهلك حالي: Accounting (ترحيل فرق التسليم لو موجود، نفس فلسفة
// ShiftClosedEvent). handoverVariance=0 يعني مفيش فرق يتترحّل خالص
export class DriverSettlementCreatedEvent extends DomainEvent {
  readonly eventName = "DriverSettlementCreated";

  constructor(
    public readonly settlementId: string,
    public readonly branchId: string,
    public readonly handoverVariance: number,
    public readonly settledBy: string | null
  ) {
    super();
  }
}
