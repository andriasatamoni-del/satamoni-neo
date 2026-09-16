import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما قائمة رواتب تتعتمد - مستهلك حقيقي: Accounting (ترحيل قيد مصروف رواتب/رواتب مستحقة تلقائي)،
// نفس فلسفة OrderRegisteredEvent->Accounting بالظبط (راجع خطة إعادة البناء قسم 2 - نفس المثال
// "PayrollRunApproved -> Accounting" المذكور هناك بالحرف)
export class PayrollRunApprovedEvent extends DomainEvent {
  readonly eventName = "PayrollRunApproved";

  constructor(
    public readonly payrollRunId: string,
    public readonly year: number,
    public readonly month: number,
    public readonly totalNetPay: number,
    public readonly approvedBy: string | null
  ) {
    super();
  }
}
