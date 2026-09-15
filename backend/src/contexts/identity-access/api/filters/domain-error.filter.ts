import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError, InvalidCredentialsError, UserNotFoundError } from "../../domain/errors";

// بيحوّل أخطاء الدومين (اللي مالهاش أي علاقة بـHTTP) لاستجابة HTTP مناسبة - الدومين نفسه مايعرفش
// حاجة عن status codes خالص، ده كله في طبقة الـAPI بس
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof InvalidCredentialsError
        ? 401
        : exception instanceof UserNotFoundError
          ? 404
          : 400;
    res.status(status).json({ error: exception.message });
  }
}
