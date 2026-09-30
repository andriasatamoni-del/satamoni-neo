import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class InvalidPhoneError extends DomainError {
  constructor() {
    super("رقم التليفون غير صالح");
  }
}

export class CustomerNameRequiredError extends DomainError {
  constructor() {
    super("لازم الاسم");
  }
}

export class WeakCustomerPasswordError extends DomainError {
  constructor(minLength: number) {
    super(`كلمة السر لازم تكون ${minLength} حروف/أرقام على الأقل`);
  }
}

export class CustomerAccountAlreadyExistsError extends DomainError {
  constructor() {
    super("الرقم ده عنده حساب بالفعل - سجل دخول بدل التسجيل");
  }
}

export class InvalidCustomerCredentialsError extends DomainError {
  constructor() {
    super("رقم التليفون أو كلمة السر غلط");
  }
}

export class CustomerNotFoundError extends DomainError {
  constructor() {
    super("الحساب ده مش موجود");
  }
}

export class CustomerAddressRequiredError extends DomainError {
  constructor() {
    super("لازم تفاصيل العنوان");
  }
}

export class InvalidEmailError extends DomainError {
  constructor() {
    super("الإيميل غير صالح");
  }
}

export class EmailAlreadyUsedError extends DomainError {
  constructor() {
    super("الإيميل ده مستخدم في حساب تاني");
  }
}

export class SecondPhoneRequiredError extends DomainError {
  constructor() {
    super("لازم رقم تليفون تاني مختلف عن الأساسي");
  }
}

export class CustomerAddressFieldRequiredError extends DomainError {
  constructor(field: string) {
    super(`لازم ${field} في العنوان`);
  }
}

export class CustomerAddressNotFoundError extends DomainError {
  constructor() {
    super("العنوان ده مش موجود");
  }
}
