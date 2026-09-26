import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class InvalidWebhookSignatureError extends DomainError {
  constructor() {
    super("توقيع الـwebhook غير صحيح أو غير موجود");
  }
}

export class DuplicateWebhookEventError extends DomainError {
  constructor() {
    super("الحدث ده اتسجّل قبل كده (نفس الجسم بالحرف)");
  }
}

export class TalabatOrderNotFoundError extends DomainError {
  constructor() {
    super("مفيش أوردر Talabat متسجّل بالمعرّف ده");
  }
}

export class IntegrationErrorNotFoundError extends DomainError {
  constructor() {
    super("مفيش خطأ تكامل متسجّل بالمعرّف ده");
  }
}

export class InvalidProductMappingError extends DomainError {
  constructor() {
    super("لازم معرّف صنف Talabat فعلي، وحجم/عرض حقيقي من المنيو");
  }
}

// نفس فلسفة talabat-client.js STUB بالريبو القديم بالحرف - كل نداء فعلي لـTalabat API (OAuth/GET order
// details/history) بيرمي الخطأ ده لحد ما مواصفة Talabat Partner API الحقيقية تتوفر (راجع docs الملف)
export class TalabatNotImplementedError extends DomainError {
  constructor(operation: string) {
    super(`${operation}: الاتصال الفعلي بـTalabat API لسه موقوف عمدًا - محتاج مواصفة Partner API الحقيقية أولًا`);
  }
}
