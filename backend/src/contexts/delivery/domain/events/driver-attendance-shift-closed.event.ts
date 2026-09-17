import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما شيفت حضور سائق يتقفل - مستهلك حالي: Accounting (ترحيل مصروف الأجر+البونص كقيد واحد،
// نفس فلسفة PayrollRunApprovedEvent). totalPay<=0 يعني مفيش قيد يتترحّل خالص
export class DriverAttendanceShiftClosedEvent extends DomainEvent {
  readonly eventName = "DriverAttendanceShiftClosed";

  constructor(
    public readonly shiftId: string,
    public readonly branchId: string,
    public readonly totalPay: number,
    public readonly closedBy: string | null
  ) {
    super();
  }
}
