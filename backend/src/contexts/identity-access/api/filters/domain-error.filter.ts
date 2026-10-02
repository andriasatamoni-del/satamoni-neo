import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError, InvalidCredentialsError, UserNotFoundError } from "../../domain/errors";
import { recordDenied } from "../../../../shared/audit/audit-denial";

// بيحوّل أخطاء الدومين (اللي مالهاش أي علاقة بـHTTP) لاستجابة HTTP مناسبة - الدومين نفسه مايعرفش
// حاجة عن status codes خالص، ده كله في طبقة الـAPI بس
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    // Phase 3.1: errors that declare their own status (conflict 409 / forbidden 403)
    if (exception.httpStatus) {
      if (exception.httpStatus === 403) void recordDenied(host, 403, exception.name);
      res.status(exception.httpStatus).json({ error: exception.message });
      return;
    }
    const status =
      exception instanceof InvalidCredentialsError
        ? 401
        : exception instanceof UserNotFoundError
          ? 404
          : 400;
    res.status(status).json({ error: exception.message });
  }
}
