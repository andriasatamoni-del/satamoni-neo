import { DomainError } from "../../../shared/domain/domain-error";
export { DomainError };

export class UnknownTreasuryKindError extends DomainError {
  constructor(value: string) {
    super(`نوع الخزينة ده مش معروف: ${value}`);
  }
}

export class TreasuryBranchRequiredError extends DomainError {
  constructor() {
    super("لازم تحدد الفرع للخزينة الرئيسية");
  }
}

export class TreasuryNotFoundError extends DomainError {
  constructor() {
    super("الخزينة دي مش موجودة");
  }
}

export class MainTreasuryAlreadyExistsError extends DomainError {
  constructor() {
    super("الفرع ده عنده خزينة رئيسية بالفعل");
  }
}

export class SameTreasuryTransferError extends DomainError {
  constructor() {
    super("مينفعش تحوّل خزينة لنفسها");
  }
}

export class InvalidTransferAmountError extends DomainError {
  constructor() {
    super("لازم مبلغ التحويل يكون أكبر من صفر");
  }
}

export class BankNotFoundError extends DomainError {
  constructor() {
    super("البنك ده مش موجود");
  }
}

export class BankAccountNotFoundError extends DomainError {
  constructor() {
    super("الحساب البنكي ده مش موجود");
  }
}

export class BankNameRequiredError extends DomainError {
  constructor() {
    super("لازم اسم البنك");
  }
}
