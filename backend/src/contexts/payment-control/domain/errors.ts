import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class PaymentMethodNameRequiredError extends DomainError {
  constructor() {
    super("اسم طريقة الدفع مطلوب");
  }
}

export class UnknownPaymentMethodKindError extends DomainError {
  constructor(value: string) {
    super(`نوع طريقة الدفع ده مش معروف: ${value}`);
  }
}

export class UnknownSettlementChannelError extends DomainError {
  constructor(value: string) {
    super(`قناة التسوية دي مش معروفة: ${value}`);
  }
}

export class PaymentMethodNotFoundError extends DomainError {
  constructor() {
    super("طريقة الدفع دي مش موجودة");
  }
}

export class PaymentNotFoundError extends DomainError {
  constructor() {
    super("الدفعة دي مش موجودة");
  }
}

export class PaymentAlreadyLockedForOrderError extends DomainError {
  constructor() {
    super("الطلب ده متسجّل له دفعة مقفولة بالفعل");
  }
}

export class AdjustmentRequestNotFoundError extends DomainError {
  constructor() {
    super("طلب التعديل ده مش موجود");
  }
}

export class AdjustmentRequestAlreadyDecidedError extends DomainError {
  constructor() {
    super("طلب التعديل ده اتقرر فيه بالفعل (معتمد أو مرفوض)");
  }
}

export class InsufficientApprovalLevelError extends DomainError {
  constructor() {
    super("فرق المبلغ ده محتاج اعتماد محاسب/أدمن (سقف عالي)، مش مدير فرع");
  }
}

export class ReconciliationRecordNotFoundError extends DomainError {
  constructor() {
    super("سطر المطابقة ده مش موجود");
  }
}

export class ReconciliationRecordAlreadyDecidedError extends DomainError {
  constructor() {
    super("سطر المطابقة ده اتطابق أو اتجاهل بالفعل");
  }
}

export class EmptyImportBatchError extends DomainError {
  constructor() {
    super("الملف فاضي - مفيش سطور تتاستورد");
  }
}

export class ImportBatchNotFoundError extends DomainError {
  constructor() {
    super("دفعة الاستيراد دي مش موجودة");
  }
}

export class ImportBatchHasDecidedRecordsError extends DomainError {
  constructor() {
    super("دفعة الاستيراد دي فيها سطور اتطابقت أو اتجاهلت بالفعل - رجّعها يدويًا سطر سطر مش كدفعة");
  }
}
