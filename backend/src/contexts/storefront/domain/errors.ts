import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class OnlineOrderingClosedError extends DomainError {
  constructor() {
    super("الطلب أونلاين مقفول حاليًا - تقدر تكلّمنا على تليفون الفرع");
  }
}

export class InvalidOnlineOrderError extends DomainError {}

export class OnlineOrderBranchNotAvailableError extends DomainError {
  constructor() {
    super("الفرع ده مش متاح للطلب أونلاين");
  }
}

export class CustomerBlockedForOnlineOrderError extends DomainError {
  constructor() {
    super("مش متاح الطلب أونلاين من الرقم ده - كلّمنا على تليفون الفرع");
  }
}

export class OnlineOrderItemUnavailableError extends DomainError {
  constructor() {
    super("فيه صنف في طلبك مش متاح دلوقتي - شيله أو غيّره وجرّب تاني");
  }
}

export class OnlineOrderNotFoundError extends DomainError {
  constructor() {
    super("الطلب مش موجود أو اللينك غلط");
  }
}
