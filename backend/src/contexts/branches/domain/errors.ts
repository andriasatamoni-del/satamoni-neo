import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class BranchNameRequiredError extends DomainError {
  constructor() {
    super("اسم الفرع مطلوب");
  }
}

export class BranchNotFoundError extends DomainError {
  constructor() {
    super("الفرع ده مش موجود");
  }
}
