import { DomainError } from "../../../shared/domain/domain-error";

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

export class OrderAlreadyFinalizedError extends DomainError {
  constructor() {
    super("الطلب ده اتقفل بالفعل (مكتمل أو ملغي)، مينفعش تتعدّل حالته");
  }
}

export class OrderCancelledError extends DomainError {
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

export class InsufficientStockForOrderError extends DomainError {
  constructor(itemName: string) {
    super(`المخزون مش كفاية للصنف: ${itemName}`);
  }
}
