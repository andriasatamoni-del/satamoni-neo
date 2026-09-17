import { DomainEvent } from "../../../../shared/events/domain-event";

// بينشر لما أمر تحويل يُكمَّل بقيمة (منتج تام و/أو مكونات مستهلكة) - مستهلك حالي: Accounting (يرحّل
// قيد واحد: مدين 1400 بقيمة الناتج/دائن 1400 بقيمة المستهلك/فرق الإنتاج على 5300)
export class ConversionOrderCompletedEvent extends DomainEvent {
  readonly eventName = "ConversionOrderCompleted";

  constructor(
    public readonly conversionOrderId: string,
    public readonly branchId: string,
    public readonly finishedGoodsValue: number,
    public readonly rawMaterialValue: number,
    public readonly createdBy: string | null
  ) {
    super();
  }
}
