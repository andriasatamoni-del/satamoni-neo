import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class HomeTileNotFoundError extends DomainError {
  constructor() {
    super("البطاقة دي مش موجودة");
  }
}

export class HomeTileTitleRequiredError extends DomainError {
  constructor() {
    super("عنوان البطاقة مطلوب");
  }
}
