import { ConflictDomainError, DomainError } from "../../../shared/domain/domain-error";
import type { TerminationBlocker } from "./termination-blocker";

export { DomainError };

// فيه بنود معلّقة (شيفت شغال/راتب معتمد لسه) قبل إنهاء خدمة موظف - راجع TerminationBlockersService.
// القرار مش قفل صارم: لو الطالب متأكد رغم المعلّقات، يبعت الطلب تاني مع acknowledgeBlockers:true
// نفس قاعدة الريبو القديم بالحرف (db/employee-service.js): نقل موظف بين الفروع (restrictedBranchId)
// أدمن بس، بغض النظر عن أي صلاحية hr.employees.manage تانية
export class BranchTransferRequiresAdminError extends DomainError {
  constructor() {
    super("نقل موظف بين الفروع أدمن بس");
  }
}

export class TerminationBlockersError extends DomainError {
  constructor(public readonly blockers: TerminationBlocker[]) {
    super("فيه بنود معلّقة لازم تراجعها قبل إنهاء خدمة الموظف - لو متأكد، ابعت الطلب تاني مع acknowledgeBlockers:true");
  }
}

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

export class PayrollRunNotDraftError extends ConflictDomainError {
  constructor() {
    super("قائمة الرواتب دي مش DRAFT - غير قابلة للحذف أو الاعتماد بالحالة دي");
  }
}

export class PayrollRunNotApprovedError extends ConflictDomainError {
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

export class LeaveRequestNotPendingError extends ConflictDomainError {
  constructor() {
    super("طلب الإجازة ده اتراجع بالفعل - مينفعش تعدّل حالته تاني");
  }
}

export class EmployeeAttendanceShiftAlreadyActiveError extends ConflictDomainError {
  constructor() {
    super("فيه شيفت حضور شغال بالفعل للموظف ده - لازم يقفله الأول");
  }
}

export class EmployeeAttendanceShiftNotFoundError extends DomainError {
  constructor() {
    super("شيفت الحضور ده مش موجود");
  }
}

export class EmployeeAttendanceShiftNotActiveError extends ConflictDomainError {
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

export class PayrollAdjustmentAlreadyCancelledError extends ConflictDomainError {
  constructor() {
    super("السجل ده ملغى بالفعل");
  }
}

export class CancellationReasonRequiredError extends DomainError {
  constructor() {
    super("لازم سبب الإلغاء");
  }
}

export class DepartmentCodeRequiredError extends DomainError {
  constructor() {
    super("كود القسم مطلوب");
  }
}

export class DepartmentNameRequiredError extends DomainError {
  constructor() {
    super("اسم القسم مطلوب");
  }
}

export class DepartmentNotFoundError extends DomainError {
  constructor() {
    super("القسم ده مش موجود");
  }
}

export class DuplicateDepartmentCodeError extends DomainError {
  constructor() {
    super("كود القسم ده مستخدم بالفعل");
  }
}

export class DuplicateDepartmentNameError extends DomainError {
  constructor() {
    super("اسم القسم ده مستخدم بالفعل");
  }
}

export class PositionCodeRequiredError extends DomainError {
  constructor() {
    super("كود المسمى الوظيفي مطلوب");
  }
}

export class PositionNameRequiredError extends DomainError {
  constructor() {
    super("اسم المسمى الوظيفي مطلوب");
  }
}

export class PositionNotFoundError extends DomainError {
  constructor() {
    super("المسمى الوظيفي ده مش موجود");
  }
}

export class DuplicatePositionCodeError extends DomainError {
  constructor() {
    super("كود المسمى الوظيفي ده مستخدم بالفعل");
  }
}

// BL-10: payroll adjustments <-> payroll runs
export class PayrollAdjustmentMismatchError extends ConflictDomainError {
  constructor(employeeName: string, details: string) {
    super(
      `قيم السلف/الجزاءات/المكافآت لـ${employeeName} مختلفة عن التسويات المسجّلة للشهر ده (${details}) - اتركها فاضية عشان تتحسب تلقائي، أو أكّد التعديل بـ acknowledgeAdjustmentMismatch`
    );
  }
}

export class PayrollAdjustmentLinkedToRunError extends ConflictDomainError {
  constructor() {
    super("التسوية دي مرتبطة بقائمة رواتب - لازم تتلغى/تتحذف القائمة الأول عشان تقدر تلغي التسوية");
  }
}

export class UnappliedPayrollAdjustmentsError extends ConflictDomainError {
  constructor(count: number) {
    super(`فيه ${count} تسوية (سلفة/جزاء/مكافأة) نشطة للشهر ده مش داخلة في القائمة - احذف المسودة وأنشئها من جديد قبل الاعتماد`);
  }
}
