import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class InvalidUnitError extends DomainError {
  constructor() {
    super("لازم تحدد وحدة قياس للصنف");
  }
}

export class UnknownItemTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع الصنف ده مش معروف: ${value}`);
  }
}

export class UnknownNegativeStockPolicyError extends DomainError {
  constructor(value: string) {
    super(`سياسة الرصيد السالب دي مش معروفة: ${value}`);
  }
}

export class DuplicateItemNameError extends DomainError {
  constructor(name: string) {
    super(`في صنف بنفس الاسم ده بالفعل: ${name}`);
  }
}

export class InventoryItemNotFoundError extends DomainError {
  constructor() {
    super("الصنف ده مش موجود");
  }
}

export class UnknownMovementTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع الحركة ده مش معروف: ${value}`);
  }
}

export class ZeroQuantityMovementError extends DomainError {
  constructor() {
    super("كمية الحركة لازم تكون مختلفة عن صفر");
  }
}

export class InsufficientStockError extends DomainError {
  constructor() {
    super("الرصيد مش كفاية، والصنف ده معندوش سياسة السماح بالرصيد السالب");
  }
}

export class EmptyStocktakeError extends DomainError {
  constructor() {
    super("لازم الجرد يكون فيه بند واحد على الأقل");
  }
}

export class InvalidStocktakeQuantityError extends DomainError {
  constructor() {
    super("الكمية الفعلية لازم تكون رقم صحيح (صفر أو أكبر)");
  }
}

export class StocktakeNotFoundError extends DomainError {
  constructor() {
    super("جلسة الجرد دي مش موجودة");
  }
}
