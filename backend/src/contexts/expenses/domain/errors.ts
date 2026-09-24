import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class ExpenseCategoryNameRequiredError extends DomainError {
  constructor() {
    super("لازم اسم بند المصروف");
  }
}

export class ExpenseCategoryNotFoundError extends DomainError {
  constructor() {
    super("بند المصروف ده مش موجود");
  }
}

export class DuplicateExpenseCategoryNameError extends DomainError {
  constructor(name: string) {
    super(`في بند مصروف بنفس الاسم ده بالفعل: ${name}`);
  }
}

export class InvalidExpenseAmountError extends DomainError {
  constructor() {
    super("مبلغ المصروف لازم يكون أكبر من صفر");
  }
}

export class ExpenseNotFoundError extends DomainError {
  constructor() {
    super("المصروف ده مش موجود");
  }
}

export class ExpenseNotDraftError extends DomainError {
  constructor() {
    super("المصروف ده مش في حالة مسودة");
  }
}

export class ExpenseNotSubmittedError extends DomainError {
  constructor() {
    super("المصروف ده مش في حالة انتظار مراجعة");
  }
}

export class ExpenseNotCancellableError extends DomainError {
  constructor() {
    super("المصروف ده مرحّل بالفعل - إلغاؤه محتاج عكس القيد المحاسبي بتاعه مباشرة");
  }
}

export class ExpenseAlreadyCancelledError extends DomainError {
  constructor() {
    super("المصروف ده ملغي بالفعل");
  }
}
