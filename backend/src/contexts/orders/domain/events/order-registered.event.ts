import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما طلب يتسجّل (مهما كانت حالته الأولية) - مستهلكين محتملين: Accounting (ترحيل قيد بيع)،
// تقارير، إشعارات... راجع خطة إعادة البناء قسم 2 (نفس مثال "OrderCompleted -> Accounting" المذكور
// هناك بالظبط، غير مسمّى OrderCompleted لأن الطلب هنا لسه preparing وقت التسجيل، مش completed فعليًا)
export class OrderRegisteredEvent extends DomainEvent {
  readonly eventName = "OrderRegistered";

  constructor(
    public readonly orderId: string,
    public readonly branchId: string,
    public readonly total: number,
    public readonly createdBy: string | null,
    public readonly paymentMethodId: string | null = null
  ) {
    super();
  }
}
