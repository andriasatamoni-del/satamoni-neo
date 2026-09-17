import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class SupplierNameRequiredError extends DomainError {
  constructor() {
    super("اسم المورد مطلوب");
  }
}

export class UnknownSupplierStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة المورد دي مش معروفة: ${value}`);
  }
}

export class SupplierNotFoundError extends DomainError {
  constructor() {
    super("المورد ده مش موجود");
  }
}

export class EmptyPurchaseOrderError extends DomainError {
  constructor() {
    super("لازم أمر الشراء يكون فيه بند واحد على الأقل");
  }
}

export class UnknownPurchaseOrderStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة أمر الشراء دي مش معروفة: ${value}`);
  }
}

export class PurchaseOrderNotEditableError extends DomainError {
  constructor() {
    super("أمر الشراء ده مش DRAFT، مينفعش يتعدّل");
  }
}

export class PurchaseOrderNotFoundError extends DomainError {
  constructor() {
    super("أمر الشراء ده مش موجود");
  }
}

export class EmptyGoodsReceiptError extends DomainError {
  constructor() {
    super("لازم إذن الاستلام يكون فيه بند واحد على الأقل");
  }
}

export class GoodsReceiptAlreadyConfirmedError extends DomainError {
  constructor() {
    super("إذن الاستلام ده اتأكد بالفعل، مينفعش يتعدّل أو يتأكد تاني");
  }
}

export class GoodsReceiptNotFoundError extends DomainError {
  constructor() {
    super("إذن الاستلام ده مش موجود");
  }
}

export class EmptySupplierInvoiceError extends DomainError {
  constructor() {
    super("لازم فاتورة المورد يكون فيها سطر واحد على الأقل");
  }
}

export class InvalidSupplierInvoiceLineError extends DomainError {
  constructor() {
    super("كل سطر فاتورة لازم صنف مخزون وكمية وسعر وحدة أكبر من صفر");
  }
}

export class SupplierInvoiceNumberRequiredError extends DomainError {
  constructor() {
    super("لازم رقم فاتورة المورد");
  }
}

export class DuplicateSupplierInvoiceNumberError extends DomainError {
  constructor() {
    super("رقم الفاتورة ده مسجّل بالفعل لنفس المورد");
  }
}

export class SupplierInvoiceNotFoundError extends DomainError {
  constructor() {
    super("فاتورة المورد دي مش موجودة");
  }
}

export class SupplierInvoiceNotApprovableError extends DomainError {
  constructor() {
    super("الفاتورة دي مش في حالة قابلة للاعتماد");
  }
}

export class SupplierInvoiceAlreadyCancelledError extends DomainError {
  constructor() {
    super("الفاتورة دي اتلغت بالفعل");
  }
}

export class SupplierInvoiceHasPaymentsError extends DomainError {
  constructor() {
    super("فيه سدادات مخصصة على الفاتورة دي بالفعل - مينفعش تتلغي");
  }
}

export class SupplierInvoiceNotCancellableError extends DomainError {
  constructor() {
    super("الفاتورة دي متسدد عليها بالفعل - مينفعش تتلغي");
  }
}

export class InvalidSupplierPaymentAmountError extends DomainError {
  constructor() {
    super("لازم مبلغ السداد يكون أكبر من صفر");
  }
}

export class SupplierPaymentInvoiceMismatchError extends DomainError {
  constructor() {
    super("الفاتورة دي تابعة لمورد أو فرع تاني");
  }
}

export class SupplierInvoiceNotPayableError extends DomainError {
  constructor() {
    super("الفاتورة دي مش في حالة قابلة للسداد (لازم تكون معتمدة الأول)");
  }
}

export class SupplierPaymentExceedsOutstandingError extends DomainError {
  constructor(outstanding: number) {
    super(`المبلغ أكبر من المتبقي على الفاتورة (المتبقي ${outstanding.toFixed(2)})`);
  }
}
