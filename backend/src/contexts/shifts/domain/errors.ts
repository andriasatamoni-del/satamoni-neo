import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class ShiftAlreadyActiveError extends DomainError {
  constructor() {
    super("عندك شيفت شغال بالفعل - لازم تقفله الأول");
  }
}

export class ShiftNotActiveError extends DomainError {
  constructor() {
    super("الشيفت ده مش شغال");
  }
}

export class ShiftNotPendingReviewError extends DomainError {
  constructor() {
    super("الشيفت ده مش في حالة انتظار مراجعة");
  }
}

export class ShiftNotFoundError extends DomainError {
  constructor() {
    super("الشيفت ده مش موجود");
  }
}

export class InvalidCashAmountError extends DomainError {
  constructor() {
    super("قيمة الكاش غير صالحة");
  }
}

export class BranchRequiredError extends DomainError {
  constructor() {
    super("لازم تحدد الفرع");
  }
}

export class InvalidCashDrawerEntryAmountError extends DomainError {
  constructor() {
    super("قيمة المصروف/المشترى لازم تكون أكبر من صفر");
  }
}

export class CashDrawerEntryLabelRequiredError extends DomainError {
  constructor() {
    super("لازم تكتب بيان للمصروف/المشترى");
  }
}
