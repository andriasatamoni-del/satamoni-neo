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

export class EmployeeProfileNotLinkedError extends DomainError {
  constructor() {
    super("الحساب ده مش مربوط بملف موظف");
  }
}

export class InvalidLeaveDateRangeError extends DomainError {
  constructor() {
    super("تاريخ نهاية الإجازة لازم يكون بعد أو يساوي تاريخ البداية");
  }
}

export class LeaveRequestNotFoundError extends DomainError {
  constructor() {
    super("طلب الإجازة ده مش موجود");
  }
}

export class LeaveRequestNotPendingError extends DomainError {
  constructor() {
    super("طلب الإجازة ده اتراجع بالفعل - مينفعش تعدّل حالته تاني");
  }
}

export class EmployeeAttendanceShiftAlreadyActiveError extends DomainError {
  constructor() {
    super("فيه شيفت حضور شغال بالفعل للموظف ده - لازم يقفله الأول");
  }
}

export class EmployeeAttendanceShiftNotFoundError extends DomainError {
  constructor() {
    super("شيفت الحضور ده مش موجود");
  }
}

export class EmployeeAttendanceShiftNotActiveError extends DomainError {
  constructor() {
    super("شيفت الحضور ده مقفول بالفعل");
  }
}

export class UnknownAdjustmentTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع الحركة ده مش معروف: ${value}`);
  }
}

export class AdjustmentAmountMustBePositiveError extends DomainError {
  constructor() {
    super("المبلغ لازم يكون أكبر من صفر");
  }
}

export class PayrollAdjustmentNotFoundError extends DomainError {
  constructor() {
    super("السجل ده مش موجود");
  }
}

export class PayrollAdjustmentAlreadyCancelledError extends DomainError {
  constructor() {
    super("السجل ده ملغى بالفعل");
  }
}

export class CancellationReasonRequiredError extends DomainError {
  constructor() {
    super("لازم سبب الإلغاء");
  }
}
