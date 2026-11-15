import { ConflictDomainError, DomainError } from "../../../shared/domain/domain-error";
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

export class RolesRequiredError extends DomainError {
  constructor() {
    super("لازم تختار دور واحد على الأقل");
  }
}

export class LastAdminError extends ConflictDomainError {
  constructor() {
    super("لازم يفضل مستخدم نشط واحد على الأقل بدور كامل الصلاحيات، مينفعش تشيل الدور ده من آخر واحد أو توقفه");
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

export class RoleNotFoundError extends DomainError {
  readonly httpStatus = 404;
  constructor() {
    super("الدور ده مش موجود");
  }
}

export class RoleLabelRequiredError extends DomainError {
  constructor() {
    super("لازم تكتب اسم الدور");
  }
}

export class DuplicateRoleLabelError extends ConflictDomainError {
  constructor(label: string) {
    super(`في دور بنفس الاسم ده بالفعل: ${label}`);
  }
}

export class FullAccessRoleLockedError extends DomainError {
  constructor() {
    super("الدور ده عنده كل الصلاحيات: مينفعش يتمسح أو تتعدّل صلاحياته أو نطاقه");
  }
}

export class RoleInUseError extends ConflictDomainError {
  constructor(userCount: number) {
    super(`مينفعش تمسح الدور ده لأنه متعيّن لـ${userCount} مستخدم، شيله منهم الأول`);
  }
}

export class RolesManageIsFullAccessOnlyError extends DomainError {
  constructor() {
    super("إدارة الأدوار والصلاحيات لدور كامل الصلاحيات بس، مينفعش تتدي لدور تاني");
  }
}
