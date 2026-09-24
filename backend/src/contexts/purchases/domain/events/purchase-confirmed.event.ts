import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما مشترى ببنود حقيقية يتأكد - المستهلك الحالي: Accounting (بيرحّل قيد DR مخزون (1400) /
// CR كاش (1100) بقيمة المشترى - دايمًا نقدي محاسبيًا بغض النظر عن supplierId، راجع تعليق
// purchase.aggregate.ts). totalValue=0 (مشترى بمبلغ حر من غير بنود) معناها مفيش قيد خالص
export class PurchaseConfirmedEvent extends DomainEvent {
  readonly eventName = "PurchaseConfirmed";

  constructor(
    public readonly purchaseId: string,
    public readonly branchId: string,
    public readonly totalValue: number,
    public readonly confirmedBy: string | null
  ) {
    super();
  }
}
