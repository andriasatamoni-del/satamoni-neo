import { DomainError } from "../../../shared/domain/domain-error";

export { DomainError };

export class BranchDayNotClosableError extends DomainError {
  constructor(public readonly redItems: { code: string; message: string }[]) {
    super("فيه بنود حرجة لسه مفتوحة - مينفعش تقفل اليوم");
  }
}

export class BranchDayAlreadyClosedError extends DomainError {
  constructor() {
    super("اليوم ده مقفول بالفعل");
  }
}
