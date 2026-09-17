import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class DriverNameRequiredError extends DomainError {
  constructor() {
    super("اسم السائق مطلوب");
  }
}

export class UnknownDriverStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة السائق دي مش معروفة: ${value}`);
  }
}

export class DriverNotFoundError extends DomainError {
  constructor() {
    super("السائق ده مش موجود");
  }
}

export class UnknownDispatchStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة التوصيل دي مش معروفة: ${value}`);
  }
}

export class DeliveryAssignmentAlreadyFinalizedError extends DomainError {
  constructor() {
    super("طلب التوصيل ده اتقفل بالفعل (اتسلّم/فشل/اترجّع)، مينفعش تتعدّل حالته");
  }
}

export class DeliveryAssignmentNotFoundError extends DomainError {
  constructor() {
    super("طلب التوصيل ده مش موجود");
  }
}

export class OrderAlreadyAssignedError extends DomainError {
  constructor() {
    super("الطلب ده اتحول لسائق بالفعل");
  }
}

export class DeliveryAssignmentAlreadySettledError extends DomainError {
  constructor() {
    super("طلب التوصيل ده اتحسب في تسوية سابقة بالفعل");
  }
}

export class NothingToSettleError extends DomainError {
  constructor() {
    super("مفيش طلبات توصيل مسلّمة لسه محتاجة تسوية لهذا السائق");
  }
}

export class DriverSettlementNotFoundError extends DomainError {
  constructor() {
    super("تسوية السائق دي مش موجودة");
  }
}

export class DriverSettlementNotPendingReviewError extends DomainError {
  constructor() {
    super("تسوية السائق دي مش محتاجة مراجعة فرق");
  }
}

export class InvalidHandoverAmountError extends DomainError {
  constructor() {
    super("لازم المبلغ المُسلَّم يكون رقم صحيح (صفر أو أكبر)");
  }
}

export class DriverAttendanceShiftAlreadyActiveError extends DomainError {
  constructor() {
    super("السائق ده لسه في شيفت حضور شغال - لازم يقفله الأول");
  }
}

export class DriverAttendanceShiftNotActiveError extends DomainError {
  constructor() {
    super("شيفت الحضور ده مش شغال (اتقفل بالفعل)");
  }
}

export class DriverAttendanceShiftNotFoundError extends DomainError {
  constructor() {
    super("شيفت الحضور ده مش موجود");
  }
}
