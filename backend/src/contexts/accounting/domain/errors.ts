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
