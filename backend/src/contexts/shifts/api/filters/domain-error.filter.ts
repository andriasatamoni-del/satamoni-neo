import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../../../shared/domain/domain-error";
import { ShiftNotFoundError } from "../../domain/errors";

@Catch(DomainError)
export class ShiftsDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof ShiftNotFoundError ? 404 : 400;
    res.status(status).json({ error: exception.message });
  }
}
