import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما تحضير الطلب يتقدّم خطوة (NEW->ACCEPTED->PREPARING->READY) - أول مستهلك حقيقي (TIER3-4):
// Printing بيشترك فيه عشان يطبع تذاكر مطبخ الصالة لحظة ما الطلب يوصل PREPARING فعليًا (نفس قرار الريبو
// القديم بالظبط: تذاكر مطبخ الصالة بتتطبع وقت التحضير مش وقت التسجيل، عكس تيك أواي/دليفري)
export class KitchenStatusAdvancedEvent extends DomainEvent {
  readonly eventName = "KitchenStatusAdvanced";

  constructor(
    public readonly orderId: string,
    public readonly branchId: string,
    public readonly orderType: string,
    public readonly kitchenStatus: string
  ) {
    super();
  }
}
