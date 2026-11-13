import { DomainError, ConflictDomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class EmptyOrderError extends DomainError {
  constructor() {
    super("لازم الطلب يكون فيه صنف واحد على الأقل");
  }
}

export class UnknownOrderTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع الطلب ده مش معروف: ${value}`);
  }
}

export class CancelledStatusRequiresDedicatedEndpointError extends DomainError {
  constructor() {
    super("إلغاء الطلب لازم يتم عن طريق PATCH /orders/:id/cancel - ده بيعكس استهلاك المخزون والقيد المحاسبي، مش تحديث حالة عادي");
  }
}

export class UnknownOrderStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة الطلب دي مش معروفة: ${value}`);
  }
}

export class UnknownKitchenStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة المطبخ دي مش معروفة: ${value}`);
  }
}

export class OrderAlreadyFinalizedError extends ConflictDomainError {
  constructor() {
    super("الطلب ده اتقفل بالفعل (مكتمل أو ملغي)، مينفعش تتعدّل حالته");
  }
}

export class OrderCancelledError extends ConflictDomainError {
  constructor() {
    super("الطلب ده اتلغى - مينفعش تتابع تحضيره في المطبخ");
  }
}

export class InvalidKitchenStatusTransitionError extends DomainError {
  constructor() {
    super("حالة التحضير بتتقدّم خطوة بخطوة بس - مينفعش تتخطى أو ترجع لورا");
  }
}

export class OrderNotFoundError extends DomainError {
  constructor() {
    super("الطلب ده مش موجود");
  }
}

export class VariantNotFoundForOrderError extends DomainError {
  constructor() {
    super("في سطر بيشاور على حجم صنف مش موجود");
  }
}

export class InvalidOrderItemError extends DomainError {
  constructor() {
    super("كل سطر في الطلب لازم يكون إما صنف (حجم) أو عرض، مش الاتنين ومش من غيرهم");
  }
}

export class TalabatPriceMissingForOrderError extends DomainError {
  constructor() {
    super("في سطر مالوش سعر طلبات");
  }
}

export class ComboNotFoundForOrderError extends DomainError {
  constructor() {
    super("في سطر بيشاور على عرض مش موجود أو متوقف حاليًا");
  }
}

export class AddonNotFoundForOrderError extends DomainError {
  constructor() {
    super("في إضافة مش موجودة أو موقوفة حاليًا");
  }
}

export class WithoutIngredientNotInRecipeError extends DomainError {
  constructor() {
    super("المكوّن اللي اخترته \"بدون\" مش موجود في وصفة الصنف ده");
  }
}

export class AddonOrderedAloneError extends DomainError {
  constructor() {
    super("الإضافة لازم تتضاف على صنف، مينفعش تتباع لوحدها");
  }
}

export class InsufficientStockForOrderError extends DomainError {
  constructor(itemName: string) {
    super(`المخزون مش كفاية للصنف: ${itemName}`);
  }
}

export class InvalidRatingTokenError extends DomainError {
  constructor() {
    super("اللينك ده غير صالح");
  }
}

export class InvalidRatingStarsError extends DomainError {
  constructor() {
    super("لازم تختار تقييم من 1 لـ5 نجوم");
  }
}

export class CustomerNotFoundForOrderError extends DomainError {
  constructor() {
    super("العميل ده مش موجود");
  }
}

export class DeliveryAddressRequiredError extends DomainError {
  constructor() {
    super("اختار عنوان التوصيل للعميل");
  }
}
