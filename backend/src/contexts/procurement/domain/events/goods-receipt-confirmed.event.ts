import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما استلام بضاعة يتأكد - المستهلك الحالي: Accounting (بيرحّل قيد DR مخزون (1400) / CR
// حسابات دائنة (2100) بقيمة الاستلام، بس لو ليه مورد - استلام PO-less/مشترى الكاشير الطارئ من غير
// مورد ملوش أي قيد AP، نفس فلسفة الريبو القديم بالظبط). totalValue = مجموع (الكمية × التكلفة) لكل سطر.
export class GoodsReceiptConfirmedEvent extends DomainEvent {
  readonly eventName = "GoodsReceiptConfirmed";

  constructor(
    public readonly goodsReceiptId: string,
    public readonly branchId: string,
    public readonly supplierId: string | null,
    public readonly totalValue: number,
    public readonly confirmedBy: string | null
  ) {
    super();
  }
}
