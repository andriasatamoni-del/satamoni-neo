import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class ConversionOrderNotFoundError extends DomainError {
  constructor() {
    super("أمر التحويل ده مش موجود");
  }
}

export class ConversionOrderNotDraftError extends DomainError {
  constructor() {
    super("أمر التحويل ده مش مسودة - غير قابل للاعتماد بالحالة دي");
  }
}

export class ConversionOrderNotApprovedError extends DomainError {
  constructor() {
    super("أمر التحويل ده مش معتمد - مينفعش يبدأ بالحالة دي");
  }
}

export class ConversionOrderNotInProgressError extends DomainError {
  constructor() {
    super("أمر التحويل ده مش قيد التنفيذ - مينفعش يُكمَّل بالحالة دي");
  }
}

export class ConversionOrderAlreadyFinalizedError extends DomainError {
  constructor() {
    super("أمر التحويل ده اكتمل أو اتلغى بالفعل");
  }
}

export class InvalidConversionQuantityError extends DomainError {
  constructor() {
    super("الكمية لازم تكون رقم أكبر من صفر");
  }
}

export class ConversionVarianceReasonRequiredError extends DomainError {
  constructor(variancePercent: number, threshold: number) {
    super(`فرق الإنتاج ${variancePercent.toFixed(1)}% أكبر من الحد المسموح (${threshold}%) - لازم توضّح السبب`);
  }
}

export class RecipeHasNoActiveVersionError extends DomainError {
  constructor() {
    super("الوصفة دي معندهاش نسخة نشطة حاليًا");
  }
}

export class RecipeNotManufacturedItemError extends DomainError {
  constructor() {
    super("الوصفة دي مش لصنف مصنّع - مينفعش تتحوّل لأمر تحويل");
  }
}
