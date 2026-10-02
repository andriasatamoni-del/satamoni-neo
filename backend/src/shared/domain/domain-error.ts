// أساس مشترك لكل أخطاء الدومين في أي context - الدومين نفسه مايعرفش حاجة عن HTTP، ده بس اسم +
// رسالة، وطبقة الـAPI بتاعت كل context هي اللي بتقرر status code المناسب (راجع DomainErrorFilter)
export class DomainError extends Error {
  // Phase 3.1: optional hint so an error can declare "this is a conflict/forbidden" without each context filter
  // having to enumerate it. Filters use `statusOf(error, fallback)`.
  readonly httpStatus?: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

// State/uniqueness conflicts (already confirmed, would exceed ordered quantity, duplicate approval ...) -> HTTP 409
export class ConflictDomainError extends DomainError {
  readonly httpStatus = 409;
}

// Authorization decisions taken inside the domain (segregation of duties, branch scope) -> HTTP 403
export class ForbiddenDomainError extends DomainError {
  readonly httpStatus = 403;
}

export function statusOf(error: DomainError, fallback: number): number {
  return error.httpStatus ?? fallback;
}

// Requester != approver (BL-05): the user who created/requested a protected transaction may never approve it.
export class SegregationOfDutiesError extends ForbiddenDomainError {
  constructor(action: string) {
    super(`مينفعش نفس الشخص اللي سجّل العملية يعتمدها (${action}) - لازم مستخدم تاني يعتمد`);
  }
}
