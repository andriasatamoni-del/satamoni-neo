import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class UnknownCallResultError extends DomainError {
  constructor(value: string) {
    super(`نتيجة الاتصال دي مش معروفة: ${value}`);
  }
}

export class UnknownSatisfactionRatingError extends DomainError {
  constructor(value: string) {
    super(`تقييم الرضا ده مش معروف: ${value}`);
  }
}

export class UnknownComplaintCategoryError extends DomainError {
  constructor(value: string) {
    super(`نوع الشكوى ده مش معروف: ${value}`);
  }
}

export class UnknownComplaintStatusError extends DomainError {
  constructor(value: string) {
    super(`حالة الشكوى دي مش معروفة: ${value}`);
  }
}

export class ComplaintNotFoundError extends DomainError {
  constructor() {
    super("الشكوى دي مش موجودة");
  }
}

export class FollowupNotFoundError extends DomainError {
  constructor() {
    super("المتابعة دي مش موجودة");
  }
}

export class NoUpdateFieldsProvidedError extends DomainError {
  constructor() {
    super("مفيش حاجة تتعدل");
  }
}
