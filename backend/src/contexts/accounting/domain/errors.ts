import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class AccountCodeRequiredError extends DomainError {
  constructor() {
    super("كود الحساب مطلوب");
  }
}

export class UnknownAccountTypeError extends DomainError {
  constructor(value: string) {
    super(`نوع الحساب ده مش معروف: ${value}`);
  }
}

export class AccountNotFoundError extends DomainError {
  constructor() {
    super("الحساب ده مش موجود");
  }
}

export class DuplicateAccountCodeError extends DomainError {
  constructor(code: string) {
    super(`في حساب بنفس الكود ده بالفعل: ${code}`);
  }
}

export class EmptyJournalEntryError extends DomainError {
  constructor() {
    super("لازم القيد يكون فيه سطرين على الأقل");
  }
}

export class UnbalancedJournalEntryError extends DomainError {
  constructor(totalDebit: number, totalCredit: number) {
    super(`القيد غير متزن: مدين ${totalDebit} ≠ دائن ${totalCredit}`);
  }
}

export class InvalidJournalEntryLineError extends DomainError {
  constructor() {
    super("كل سطر لازم يكون مدين أو دائن (مش الاتنين، ومش صفر في الاتنين)");
  }
}

export class JournalEntryNotFoundError extends DomainError {
  constructor() {
    super("القيد ده مش موجود");
  }
}

export class JournalEntryNotPostedError extends DomainError {
  constructor() {
    super("القيد ده لسه مش POSTED، مينفعش يتعكس");
  }
}

export class JournalEntryAlreadyReversedError extends DomainError {
  constructor() {
    super("القيد ده اتعكس بالفعل");
  }
}

export class JournalEntryNotDraftError extends DomainError {
  constructor() {
    super("القيد ده لازم يكون DRAFT عشان تقدر ترحّله");
  }
}

export class AccountingPeriodClosedError extends DomainError {
  constructor(year: number, month: number) {
    super(`الشهر المحاسبي ${year}-${String(month).padStart(2, "0")} مقفول - مينفعش يترحّل عليه أي قيد جديد`);
  }
}

export class AccountingPeriodAlreadyClosedError extends DomainError {
  constructor(year: number, month: number) {
    super(`الشهر المحاسبي ${year}-${String(month).padStart(2, "0")} مقفول بالفعل`);
  }
}

export class FiscalYearAlreadyClosedError extends DomainError {
  constructor(year: number) {
    super(`سنة ${year} مقفولة بالفعل`);
  }
}

export class FiscalYearMonthsNotAllClosedError extends DomainError {
  constructor(year: number, missingMonths: number[]) {
    super(`لازم كل شهور سنة ${year} تكون مقفولة الأول - الشهور [${missingMonths.join(", ")}] لسه مفتوحة`);
  }
}

export class NoActivityToCloseError extends DomainError {
  constructor(year: number) {
    super(`مفيش حركة محاسبية مسجّلة على سنة ${year} أصلًا - مفيش حاجة تتقفل`);
  }
}

export class RetainedEarningsAccountNotFoundError extends DomainError {
  constructor(code: string) {
    super(`حساب الأرباح المرحّلة (${code}) مش موجود في دليل الحسابات - محتاج يتسجّل الأول قبل إقفال أي سنة`);
  }
}
