import { DomainError } from "../../../shared/domain/domain-error";
export { DomainError };

export class InvalidEmailError extends DomainError {
  constructor(email: string) {
    super(`الإيميل ده مش صحيح: ${email}`);
  }
}

export class WeakPasswordError extends DomainError {
  constructor() {
    super("لازم كلمة السر تكون 8 حروف على الأقل");
  }
}

export class InvalidRoleError extends DomainError {
  constructor(role: string) {
    super(`الدور ده مش معروف: ${role}`);
  }
}

export class DuplicateEmailError extends DomainError {
  constructor(email: string) {
    super(`الإيميل ده مستخدم بالفعل: ${email}`);
  }
}

export class UserNotFoundError extends DomainError {
  constructor() {
    super("المستخدم ده مش موجود");
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("بيانات الدخول غلط");
  }
}

export class UnknownPermissionError extends DomainError {
  constructor(keys: string[]) {
    super(`صلاحيات غير معروفة: ${keys.join("، ")}`);
  }
}
