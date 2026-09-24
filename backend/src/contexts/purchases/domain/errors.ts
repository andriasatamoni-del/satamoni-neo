import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class InvalidPurchaseLineError extends DomainError {
  constructor() {
    super("كل بند لازم يكون له صنف خام موجود وكمية وسعر وحدة أكبر من أو يساوي صفر");
  }
}

export class PurchaseNotFoundError extends DomainError {
  constructor() {
    super("المشترى ده مش موجود");
  }
}

export class PurchaseNotPendingError extends DomainError {
  constructor() {
    super("المشترى ده مش في حالة انتظار مراجعة");
  }
}

export class PurchaseMissingAmountOrItemsError extends DomainError {
  constructor() {
    super("لازم تحدد مبلغ أو بند واحد على الأقل");
  }
}

export class DuplicatePurchaseReferenceError extends DomainError {
  constructor() {
    super("فيه مشترى مسجل بالفعل لنفس المورد ونفس رقم المستند في هذا الفرع - ممكن تكون نفس التوريدة اتسجلت مرتين");
  }
}
