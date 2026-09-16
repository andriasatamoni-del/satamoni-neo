import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class EmployeeNameRequiredError extends DomainError {
  constructor() {
    super("اسم الموظف مطلوب");
  }
}

export class UnknownWageTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع الأجر ده مش معروف: ${value}`);
  }
}

export class UnknownEmployeeStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة الموظف دي مش معروفة: ${value}`);
  }
}

export class EmployeeNotFoundError extends DomainError {
  constructor() {
    super("الموظف ده مش موجود");
  }
}

export class PayrollRunNotFoundError extends DomainError {
  constructor() {
    super("قائمة الرواتب دي مش موجودة");
  }
}

export class UnknownMonthError extends DomainError {
  constructor(value: number) {
    super(`الشهر ده مش صحيح: ${value} (لازم من 1 لـ12)`);
  }
}

export class PayrollRunNotDraftError extends DomainError {
  constructor() {
    super("قائمة الرواتب دي مش DRAFT - غير قابلة للحذف أو الاعتماد بالحالة دي");
  }
}

export class PayrollRunNotApprovedError extends DomainError {
  constructor() {
    super("قائمة الرواتب دي مش APPROVED - مينفعش تتلغي بالحالة دي");
  }
}

export class DuplicatePayrollPeriodError extends DomainError {
  constructor(year: number, month: number) {
    super(`فيه قائمة رواتب فعّالة بالفعل للشهر ${month}/${year} - لازم تلغيها الأول لو عايز تعمل قائمة جديدة لنفس الشهر`);
  }
}
