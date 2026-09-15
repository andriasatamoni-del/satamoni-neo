import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class DriverNameRequiredError extends DomainError {
  constructor() {
    super("اسم السائق مطلوب");
  }
}

export class UnknownDriverStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة السائق دي مش معروفة: ${value}`);
  }
}

export class DriverNotFoundError extends DomainError {
  constructor() {
    super("السائق ده مش موجود");
  }
}

export class UnknownDispatchStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة التوصيل دي مش معروفة: ${value}`);
  }
}

export class DeliveryAssignmentAlreadyFinalizedError extends DomainError {
  constructor() {
    super("طلب التوصيل ده اتقفل بالفعل (اتسلّم/فشل/اترجّع)، مينفعش تتعدّل حالته");
  }
}

export class DeliveryAssignmentNotFoundError extends DomainError {
  constructor() {
    super("طلب التوصيل ده مش موجود");
  }
}

export class OrderAlreadyAssignedError extends DomainError {
  constructor() {
    super("الطلب ده اتحول لسائق بالفعل");
  }
}
