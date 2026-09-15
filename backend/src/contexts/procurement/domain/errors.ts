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
