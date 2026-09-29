import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class WhatsappConversationNotFoundError extends DomainError {
  constructor() {
    super("محادثة الواتساب دي مش موجودة");
  }
}

export class WhatsappPendingOrderNotFoundError extends DomainError {
  constructor() {
    super("طلب الواتساب المعلّق ده مش موجود");
  }
}

export class WhatsappPendingOrderNotPendingError extends DomainError {
  constructor() {
    super("طلب الواتساب ده اتراجع بالفعل - مينفعش تتصرف فيه تاني");
  }
}

export class EmptyPendingOrderItemsError extends DomainError {
  constructor() {
    super("لازم صنف واحد على الأقل في الطلب");
  }
}

export class VariantNotFoundForPendingOrderError extends DomainError {
  constructor() {
    super("حجم الصنف ده مش موجود");
  }
}

export class WhatsappPendingOrderNotDraftError extends DomainError {
  constructor() {
    super("الطلب ده مش مسودة - اتبعت للمراجعة بالفعل");
  }
}

export class IncompletePendingOrderDraftError extends DomainError {
  constructor(public readonly missing: string[]) {
    super(`المسودة ناقصة: ${missing.join("، ")}`);
  }
}

export class InvalidWebhookSignatureError extends DomainError {
  constructor() {
    super("توقيع الـwebhook مش صحيح");
  }
}
