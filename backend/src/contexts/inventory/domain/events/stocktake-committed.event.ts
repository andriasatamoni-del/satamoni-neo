import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما جلسة جرد فعلي تتسجّل بسطور فيها فرق حقيقي (سطور الفرق=صفر مش موجودة أصلًا) - مستهلك حالي:
// Accounting (يرحّل قيد فرق مستقل لكل سطر، نفس فلسفة الريبو القديم بالظبط - قيد واحد لكل سطر مش قيد
// مجمّع، عشان كل سطر يحمل مرجعه الخاص - sourceId=inventoryMovementId)
export class StocktakeCommittedEvent extends DomainEvent {
  readonly eventName = "StocktakeCommitted";

  constructor(
    public readonly stocktakeId: string,
    public readonly branchId: string,
    public readonly createdBy: string | null,
    public readonly lines: {
      inventoryMovementId: string;
      varianceQuantity: number;
      varianceValue: number;
      chargeAccountCode: string;
    }[]
  ) {
    super();
  }
}
